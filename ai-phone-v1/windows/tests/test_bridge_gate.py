import sys,unittest,urllib.request,urllib.error
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from bridge_gate import BridgeGate
class TestBridgeGate(unittest.TestCase):
    def test_denied_without_token_then_not_ready(self):
        gate=BridgeGate(lambda:False,token='just-a-test-local-token-32-characters')
        gate.start()
        try:
            with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen('http://127.0.0.1:8765/ready',timeout=2)
            self.assertEqual(e.exception.code,403)
            r=urllib.request.Request('http://127.0.0.1:8765/ready',headers={'X-OnTrack-Bridge-Token':gate.token})
            with urllib.request.urlopen(r,timeout=2) as response:self.assertEqual(response.read(),b'{"ready":false}')
        finally:gate.stop()
if __name__=='__main__':unittest.main()
