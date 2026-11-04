import unittest
from chute.explorer import ExplorerError
from chute.explorer.interop import TransferIntent, capabilities


class InteropContractTests(unittest.TestCase):
    def payload(self):
        return dict(version="1.0", correlation_id="a" * 32, direction="local_to_cloud",
                    source="a" * 32, destination="b" * 32, name="雪.png", mime="image/png",
                    size=12, sha256="c" * 64)

    def test_copy_default_and_disabled_transport(self):
        intent = TransferIntent.parse(self.payload())
        self.assertEqual(intent.operation, "copy")
        self.assertEqual(intent.conflict, "keep_both")
        self.assertFalse(capabilities()["enabled"])

    def test_no_paths_credentials_moves_or_unknown_fields(self):
        for changes in ({"source": "/home/user/file"}, {"destination": "C:\\Users"},
                        {"token": "no"}, {"operation": "move"}, {"conflict": "replace"},
                        {"version": "2"}, {"name": "../evil"}, {"size": -1}, {"size": True},
                        {"sha256": "bad"}):
            with self.subTest(changes=changes), self.assertRaises(ExplorerError):
                TransferIntent.parse({**self.payload(), **changes})
