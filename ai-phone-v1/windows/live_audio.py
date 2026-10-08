"""Local audio-device Gemini Live bridge. Does not assert cellular route or answer calls."""
import asyncio
import os
import threading
import queue
from google import genai
from google.genai import types
import sounddevice as sd

INPUT_RATE = 16000
OUTPUT_RATE = 24000
CHUNK = 1600

class LiveAudio:
    def __init__(self, state_changed=lambda *args: None):
        self.state_changed = state_changed
        self.connected = False
        self.stop_event = threading.Event()
        self.thread = None
        self.loop = None

    def start(self, input_device, output_device, model, instructions):
        if self.thread and self.thread.is_alive():
            raise RuntimeError('Session already active')
        if not os.getenv('GEMINI_API_KEY'):
            raise RuntimeError('Set GEMINI_API_KEY in Windows environment first')
        self.stop_event.clear()
        self.thread = threading.Thread(target=self._run, args=(input_device,output_device,model,instructions), daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.loop:
            self.loop.call_soon_threadsafe(lambda: None)

    def _run(self, *args):
        try:
            asyncio.run(self._live(*args))
        except Exception as exc:
            self.state_changed('Disconnected: '+str(exc)[:250])
        finally:
            self.connected=False
            self.state_changed('Stopped')

    async def _live(self, input_device, output_device, model, instructions):
        loop=asyncio.get_running_loop()
        self.loop=loop
        inbound=asyncio.Queue(maxsize=16)
        outbound=queue.Queue(maxsize=24)
        playback_cache=bytearray()
        def on_input(indata, frames, time_info, status):
            if status or self.stop_event.is_set():return
            data=bytes(indata)
            def offer():
                if inbound.full():
                    try: inbound.get_nowait()
                    except asyncio.QueueEmpty: pass
                inbound.put_nowait(data)
            loop.call_soon_threadsafe(offer)
        def output_callback(outdata, frames, time_info, status):
            want=len(outdata)
            while len(playback_cache)<want:
                try: playback_cache.extend(outbound.get_nowait())
                except queue.Empty:break
            outdata[:]=bytes(playback_cache[:want]).ljust(want,b'\0')
            del playback_cache[:want]
        def clear_output():
            playback_cache.clear()
            while not outbound.empty():
                try:outbound.get_nowait()
                except queue.Empty:break
        def queue_audio(data):
            # A bounded queue prevents arbitrarily delayed responses.
            if outbound.full():clear_output()
            outbound.put_nowait(data)
        config=types.LiveConnectConfig(
            response_modalities=[types.Modality.AUDIO],
            system_instruction=types.Content(parts=[types.Part(text=instructions)]),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig())
        self.state_changed('Connecting to Gemini Live...')
        client=genai.Client(api_key=os.environ['GEMINI_API_KEY'])
        try:
            async with client.aio.live.connect(model=model,config=config) as session:
                with sd.RawInputStream(samplerate=INPUT_RATE,blocksize=CHUNK,channels=1,dtype='int16',device=input_device,callback=on_input), sd.RawOutputStream(samplerate=OUTPUT_RATE,blocksize=2400,channels=1,dtype='int16',device=output_device,callback=output_callback):
                    self.connected=True
                    self.state_changed('Gemini Live connected (device audio only)')
                    async def send():
                        while not self.stop_event.is_set():
                            try: data=await asyncio.wait_for(inbound.get(),timeout=.25)
                            except asyncio.TimeoutError:continue
                            await session.send_realtime_input(audio=types.Blob(data=data,mime_type='audio/pcm;rate=16000'))
                    async def recv():
                        while not self.stop_event.is_set():
                            async for msg in session.receive():
                                sc=msg.server_content
                                if not sc:continue
                                if sc.interrupted: clear_output()
                                if sc.model_turn:
                                    for part in sc.model_turn.parts:
                                        if part.inline_data and isinstance(part.inline_data.data,bytes):
                                            queue_audio(part.inline_data.data)
                    send_task=asyncio.create_task(send());recv_task=asyncio.create_task(recv())
                    try:
                        while not self.stop_event.is_set():
                            done,_=await asyncio.wait([send_task,recv_task],timeout=.2,return_when=asyncio.FIRST_COMPLETED)
                            if done:
                                for task in done:task.result()
                                raise RuntimeError('Gemini session ended')
                    finally:
                        for task in (send_task,recv_task):task.cancel()
                        await asyncio.gather(send_task,recv_task,return_exceptions=True)
        finally:
            self.connected=False
            await client.aio.aclose()
            self.loop=None
