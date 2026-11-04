from chute.native_host import native_main


if __name__ == "__main__":
    try:
        result = native_main()
    except Exception:
        # Chrome reports a failed native connection. A windowed helper must not
        # replace that inline error with a PyInstaller traceback dialog.
        result = 1
    raise SystemExit(result)
