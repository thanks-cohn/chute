#include <QApplication>
#include <QAction>
#include <QContextMenuEvent>
#include <QCursor>
#include <QDir>
#include <QDrag>
#include <QDragEnterEvent>
#include <QDragLeaveEvent>
#include <QDropEvent>
#include <QEnterEvent>
#include <QEvent>
#include <QFile>
#include <QFileInfo>
#include <QFileSystemWatcher>
#include <QGuiApplication>
#include <QIcon>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QListWidget>
#include <QMenu>
#include <QMimeData>
#include <QMouseEvent>
#include <QPainter>
#include <QPainterPath>
#include <QProcess>
#include <QScreen>
#include <QSettings>
#include <QStandardPaths>
#include <QTimer>
#include <QUrl>
#include <QVBoxLayout>
#include <QWidget>

namespace {
constexpr int kCollapsedWidth = 92;
constexpr int kCollapsedHeight = 104;
constexpr int kExpandedWidth = 300;
constexpr int kExpandedHeight = 320;
constexpr int kScreenMargin = 18;
constexpr int kHiddenSliver = 12;
constexpr int kInitialVisibleMs = 10000;
constexpr int kLeaveHideMs = 700;

QString chuteHome() {
    const QByteArray overridePath = qgetenv("CHUTE_HOME");
    if (!overridePath.isEmpty()) return QDir::cleanPath(QString::fromLocal8Bit(overridePath));
    return QDir::homePath() + "/Chute";
}

QString chuteCli() {
    const QByteArray overridePath = qgetenv("CHUTE_CLI");
    if (!overridePath.isEmpty()) return QString::fromLocal8Bit(overridePath);
    const QString found = QStandardPaths::findExecutable("chute");
    if (!found.isEmpty()) return found;
    return QDir::homePath() + "/.local/bin/chute";
}

QString storedPath(const QString &root, const QString &storedName) {
    const QString leaf = QFileInfo(storedName).fileName();
    if (storedName.startsWith("custom-thumbnails/")) return root + "/custom-thumbnails/" + leaf;
    return root + "/files/" + leaf;
}
}

class ChuteList final : public QListWidget {
public:
    explicit ChuteList(QWidget *parent = nullptr) : QListWidget(parent) {
        setDragEnabled(true);
        setDragDropMode(QAbstractItemView::DragOnly);
        setSelectionMode(QAbstractItemView::SingleSelection);
        setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
        setStyleSheet(
            "QListWidget { background: rgba(255,255,255,235); border: 0; border-radius: 12px; padding: 4px; }"
            "QListWidget::item { padding: 7px; border-radius: 8px; color: #171717; }"
            "QListWidget::item:selected { background: rgba(255,204,49,180); color: #111; }"
        );
    }

protected:
    void startDrag(Qt::DropActions) override {
        QListWidgetItem *item = currentItem();
        if (!item) return;
        const QString path = item->data(Qt::UserRole).toString();
        if (path.isEmpty() || !QFileInfo::exists(path)) return;

        auto *mime = new QMimeData;
        mime->setUrls({QUrl::fromLocalFile(path)});
        mime->setText(path);
        auto *drag = new QDrag(this);
        drag->setMimeData(mime);
        if (!item->icon().isNull()) drag->setPixmap(item->icon().pixmap(48, 48));
        drag->exec(Qt::CopyAction);
    }
};

class ChuteOverlay final : public QWidget {
public:
    ChuteOverlay()
        : root_(chuteHome()),
          queuePath_(root_ + "/queue.json"),
          settings_(root_ + "/desktop.ini", QSettings::IniFormat) {
        setWindowTitle("Chute Desktop");
        setObjectName("chuteDesktopOverlay");
        setWindowFlags(Qt::Tool | Qt::FramelessWindowHint | Qt::WindowStaysOnTopHint);
        setAttribute(Qt::WA_TranslucentBackground);
        setAcceptDrops(true);
        setMouseTracking(true);

        autoHide_ = settings_.value("overlay/autoHide", true).toBool();

        auto *layout = new QVBoxLayout(this);
        layout->setContentsMargins(10, 10, 10, 10);
        layout->setSpacing(7);

        header_ = new QWidget(this);
        header_->setFixedHeight(72);
        header_->setCursor(Qt::PointingHandCursor);
        header_->installEventFilter(this);

        list_ = new ChuteList(this);
        list_->hide();
        layout->addWidget(header_);
        layout->addWidget(list_, 1);

        hideTimer_.setSingleShot(true);
        connect(&hideTimer_, &QTimer::timeout, this, [this] { hideOverlay(); });

        refreshTimer_.setInterval(1200);
        connect(&refreshTimer_, &QTimer::timeout, this, [this] { refreshQueue(); });
        refreshTimer_.start();

        connect(&watcher_, &QFileSystemWatcher::fileChanged, this, [this] {
            watchQueue();
            refreshQueue();
        });
        connect(&watcher_, &QFileSystemWatcher::directoryChanged, this, [this] {
            watchQueue();
            refreshQueue();
        });

        QDir().mkpath(root_);
        watcher_.addPath(root_);
        watchQueue();
        setExpanded(false);
        refreshQueue();
        show();
        raise();
        moveToAnchor(false);

        if (autoHide_) {
            QTimer::singleShot(kInitialVisibleMs, this, [this] {
                if (!expanded_ && !underMouse()) hideOverlay();
            });
        }
    }

protected:
    bool eventFilter(QObject *watched, QEvent *event) override {
        if (watched == header_ && event->type() == QEvent::MouseButtonRelease) {
            const auto *mouse = static_cast<QMouseEvent *>(event);
            if (mouse->button() == Qt::LeftButton) {
                revealOverlay();
                setExpanded(!expanded_);
                return true;
            }
        }
        return QWidget::eventFilter(watched, event);
    }

    void enterEvent(QEnterEvent *event) override {
        Q_UNUSED(event);
        revealOverlay();
        hideTimer_.stop();
    }

    void leaveEvent(QEvent *event) override {
        Q_UNUSED(event);
        if (autoHide_ && !expanded_) hideTimer_.start(kLeaveHideMs);
    }

    void contextMenuEvent(QContextMenuEvent *event) override {
        QMenu menu(this);
        QAction *autoHide = menu.addAction("Auto-hide");
        autoHide->setCheckable(true);
        autoHide->setChecked(autoHide_);
        QAction *refresh = menu.addAction("Refresh");
        menu.addSeparator();
        QAction *quit = menu.addAction("Quit desktop Chute");
        QAction *chosen = menu.exec(event->globalPos());
        if (chosen == autoHide) {
            autoHide_ = autoHide->isChecked();
            settings_.setValue("overlay/autoHide", autoHide_);
            settings_.sync();
            if (!autoHide_) revealOverlay();
        } else if (chosen == refresh) {
            refreshQueue();
        } else if (chosen == quit) {
            qApp->quit();
        }
    }

    void dragEnterEvent(QDragEnterEvent *event) override {
        if (event->mimeData()->hasUrls()) {
            dropHot_ = true;
            revealOverlay();
            update();
            event->acceptProposedAction();
        }
    }

    void dragLeaveEvent(QDragLeaveEvent *event) override {
        Q_UNUSED(event);
        dropHot_ = false;
        update();
    }

    void dropEvent(QDropEvent *event) override {
        QStringList paths;
        for (const QUrl &url : event->mimeData()->urls()) {
            if (url.isLocalFile()) paths << url.toLocalFile();
        }
        dropHot_ = false;
        update();
        if (paths.isEmpty()) return;

        QStringList args{"send", "--no-start"};
        args.append(paths);
        if (!QProcess::startDetached(chuteCli(), args)) {
            statusText_ = "Could not add drop";
            update();
            return;
        }
        statusText_ = paths.size() == 1 ? "Picked up 1 item" : QString("Picked up %1 items").arg(paths.size());
        QTimer::singleShot(500, this, [this] { refreshQueue(); });
        event->acceptProposedAction();
    }

    void paintEvent(QPaintEvent *event) override {
        Q_UNUSED(event);
        QPainter painter(this);
        painter.setRenderHint(QPainter::Antialiasing, true);

        const QRectF card = rect().adjusted(1, 1, -1, -1);
        QPainterPath path;
        path.addRoundedRect(card, 18, 18);
        painter.fillPath(path, QColor(255, 211, 61, 246));
        QPen border(dropHot_ ? QColor(255, 111, 40) : QColor(35, 35, 35, 175), dropHot_ ? 4 : 2);
        painter.setPen(border);
        painter.drawPath(path);

        const QRect headerRect(10, 9, width() - 20, 72);
        painter.setPen(QColor(24, 24, 24));
        QFont arrowFont = font();
        arrowFont.setPointSize(expanded_ ? 25 : 31);
        arrowFont.setBold(true);
        painter.setFont(arrowFont);
        painter.drawText(headerRect.adjusted(0, 0, 0, -22), Qt::AlignHCenter | Qt::AlignVCenter, "↓");

        QFont titleFont = font();
        titleFont.setPointSize(expanded_ ? 12 : 10);
        titleFont.setBold(true);
        painter.setFont(titleFont);
        painter.drawText(headerRect.adjusted(0, 40, 0, 0), Qt::AlignHCenter | Qt::AlignVCenter, "CHUTE");

        if (count_ > 0) {
            const QString badge = QString::number(count_);
            QFont badgeFont = font();
            badgeFont.setPointSize(8);
            badgeFont.setBold(true);
            painter.setFont(badgeFont);
            painter.setBrush(QColor(32, 32, 32));
            painter.setPen(Qt::NoPen);
            const QRectF badgeRect(width() - 34, 8, 25, 20);
            painter.drawRoundedRect(badgeRect, 10, 10);
            painter.setPen(Qt::white);
            painter.drawText(badgeRect, Qt::AlignCenter, badge);
        }

        if (dropHot_) {
            QFont dropFont = font();
            dropFont.setPointSize(expanded_ ? 15 : 9);
            dropFont.setBold(true);
            painter.setFont(dropFont);
            painter.setPen(QColor(128, 42, 0));
            painter.drawText(rect().adjusted(8, 0, -8, -8), Qt::AlignHCenter | Qt::AlignBottom, "DROP HERE");
        } else if (!statusText_.isEmpty() && !expanded_) {
            QFont statusFont = font();
            statusFont.setPointSize(7);
            painter.setFont(statusFont);
            painter.setPen(QColor(65, 65, 65));
            painter.drawText(rect().adjusted(5, 0, -5, -5), Qt::AlignHCenter | Qt::AlignBottom, statusText_);
        }
    }

private:
    void watchQueue() {
        if (QFileInfo::exists(queuePath_) && !watcher_.files().contains(queuePath_)) watcher_.addPath(queuePath_);
    }

    void refreshQueue() {
        QFile file(queuePath_);
        if (!file.open(QIODevice::ReadOnly)) {
            if (count_ != 0) {
                count_ = 0;
                list_->clear();
                update();
            }
            return;
        }
        const QJsonDocument document = QJsonDocument::fromJson(file.readAll());
        if (!document.isArray()) return;

        const QJsonArray rows = document.array();
        count_ = 0;
        list_->clear();
        for (int i = rows.size() - 1; i >= 0; --i) {
            const QJsonObject row = rows.at(i).toObject();
            const QString storedName = row.value("stored_name").toString();
            const QString path = storedPath(root_, storedName);
            if (!QFileInfo::exists(path)) continue;
            ++count_;
            if (list_->count() >= 30) continue;

            const QString name = row.value("name").toString("file");
            auto *item = new QListWidgetItem(name, list_);
            item->setData(Qt::UserRole, path);
            item->setToolTip(path);
            const QString id = row.value("id").toString();
            const QString thumb = root_ + "/thumbs/" + id + ".webp";
            if (QFileInfo::exists(thumb)) item->setIcon(QIcon(thumb));
        }
        update();
    }

    QScreen *anchorScreen() const {
        if (QScreen *screen = QGuiApplication::screenAt(QCursor::pos())) return screen;
        return QGuiApplication::primaryScreen();
    }

    void moveToAnchor(bool hidden) {
        QScreen *screen = anchorScreen();
        if (!screen) return;
        const QRect area = screen->availableGeometry();
        const int x = hidden
            ? area.right() + 1 - kHiddenSliver
            : area.right() + 1 - width() - kScreenMargin;
        const int y = area.bottom() + 1 - height() - kScreenMargin;
        move(x, y);
    }

    void revealOverlay() {
        hidden_ = false;
        moveToAnchor(false);
        raise();
    }

    void hideOverlay() {
        if (!autoHide_ || expanded_ || underMouse()) return;
        hidden_ = true;
        moveToAnchor(true);
    }

    void setExpanded(bool expanded) {
        expanded_ = expanded;
        if (expanded_) {
            hideTimer_.stop();
            setFixedSize(kExpandedWidth, kExpandedHeight);
            list_->show();
        } else {
            setFixedSize(kCollapsedWidth, kCollapsedHeight);
            list_->hide();
        }
        revealOverlay();
        update();
    }

    QString root_;
    QString queuePath_;
    QSettings settings_;
    QWidget *header_ = nullptr;
    ChuteList *list_ = nullptr;
    QFileSystemWatcher watcher_;
    QTimer hideTimer_;
    QTimer refreshTimer_;
    bool autoHide_ = true;
    bool expanded_ = false;
    bool hidden_ = false;
    bool dropHot_ = false;
    int count_ = 0;
    QString statusText_;
};

int main(int argc, char **argv) {
    QApplication app(argc, argv);
    app.setApplicationName("chute-desktop");
    app.setOrganizationName("Chute");
    ChuteOverlay overlay;
    return app.exec();
}
