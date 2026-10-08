"""OnTrack AI Phone Windows companion. Explicit audio route certification required."""
import os
import tkinter as tk
from tkinter import ttk,messagebox
import sounddevice as sd
from bridge_gate import BridgeGate
from live_audio import LiveAudio

DEFAULT_MODEL = os.getenv('GEMINI_LIVE_MODEL', 'gemini-3.8-live')

class Application:
    def __init__(self,root):
        self.root=root
        root.title('OnTrack AI Phone · Local Companion v1.0')
        root.geometry('700x690')
        root.minsize(620,610)
        self.status=tk.StringVar(value='Not connected')
        self.certified=tk.BooleanVar(value=False)
        self.ai=LiveAudio(self.thread_status)
        self.gate=BridgeGate(self.is_ready)
        self.devices=[]
        content=ttk.Frame(root,padding=20);content.pack(fill='both',expand=True)
        ttk.Label(content,text='OnTrack AI Phone',font=('Segoe UI',19,'bold')).pack(anchor='w')
        ttk.Label(content,text='Standalone Windows companion · no Asterisk, VPS, SIP or call interception',wraplength=640).pack(anchor='w',pady=3)
        ttk.Separator(content).pack(fill='x',pady=15)
        ttk.Label(content,text='Gemini Live model (must be available to your API key)').pack(anchor='w')
        self.model=tk.StringVar(value=DEFAULT_MODEL);ttk.Entry(content,textvariable=self.model).pack(fill='x',pady=3)
        ttk.Label(content,text='Audio input (cellular caller RX after verified routing)').pack(anchor='w',pady=(10,0))
        self.input=ttk.Combobox(content,state='readonly');self.input.pack(fill='x')
        ttk.Label(content,text='Audio output (audio sent back to cellular caller)').pack(anchor='w',pady=(10,0))
        self.output=ttk.Combobox(content,state='readonly');self.output.pack(fill='x')
        ttk.Button(content,text='Refresh audio devices',command=self.refresh_devices).pack(anchor='w',pady=7)
        ttk.Label(content,text='AI instructions').pack(anchor='w',pady=(10,0))
        self.prompt=tk.Text(content,height=5,wrap='word')
        self.prompt.insert('1.0','You are a polite Arabic/English telephone assistant. On your first answer disclose that you are an AI assistant. Never hang up solely because you said goodbye. Do not claim to have performed an action without a tool confirmation.')
        self.prompt.pack(fill='x')
        ttk.Label(content,text='Gemini key: set GEMINI_API_KEY as an environment variable. This app does not save API keys.').pack(anchor='w',pady=9)
        row=ttk.Frame(content);row.pack(fill='x',pady=6)
        ttk.Button(row,text='Start Gemini session',command=self.start).pack(side='left',padx=3)
        ttk.Button(row,text='Stop / clear AI',command=self.stop).pack(side='left',padx=3)
        ttk.Checkbutton(content,text='I physically verified BOTH directions of SIM call audio on these selected endpoints',variable=self.certified).pack(anchor='w',pady=7)
        ttk.Label(content,text='Safety gate: Android can auto-answer only while Gemini is connected AND this audio verification is checked.',foreground='firebrick',wraplength=630).pack(anchor='w')
        ttk.Label(content,textvariable=self.status,wraplength=630).pack(anchor='w',pady=12)
        self.gate.start()
        ttk.Label(content,text='USB control path: adb reverse tcp:8765 tcp:8765  (no call audio via ADB)').pack(anchor='w')
        ttk.Label(content,text='Local bridge pairing token (enter in Android settings):').pack(anchor='w',pady=(9,0))
        token=tk.Entry(content,width=60);token.insert(0,self.gate.token);token.configure(state='readonly');token.pack(anchor='w',fill='x')
        ttk.Label(content,text='Bluetooth HFP / Phone Link call-media route is NOT auto-provisioned by this program.',wraplength=630).pack(anchor='w',pady=10)
        self.refresh_devices()
        root.protocol('WM_DELETE_WINDOW',self.close)
    def refresh_devices(self):
        all_devices=sd.query_devices();self.devices=[(i,d) for i,d in enumerate(all_devices)]
        self.inputs=[(i,d) for i,d in self.devices if d['max_input_channels']>=1]
        self.outputs=[(i,d) for i,d in self.devices if d['max_output_channels']>=1]
        self.input['values']=[f'{i}: {d["name"]}' for i,d in self.inputs]
        self.output['values']=[f'{i}: {d["name"]}' for i,d in self.outputs]
        if self.inputs:self.input.current(0)
        if self.outputs:self.output.current(0)
        self.certified.set(False)
    def is_ready(self):return self.ai.connected and self.certified.get()
    def thread_status(self,s):self.root.after(0,lambda:self.status.set(s))
    def start(self):
        if not (self.inputs and self.outputs and self.input.current()>=0 and self.output.current()>=0):
            messagebox.showerror('Audio devices','Select input/output devices first');return
        try:self.ai.start(self.inputs[self.input.current()][0],self.outputs[self.output.current()][0],self.model.get().strip(),self.prompt.get('1.0','end').strip())
        except Exception as e:messagebox.showerror('Gemini Live',str(e))
    def stop(self):self.certified.set(False);self.ai.stop();self.status.set('Stopping AI; Android auto-answer disabled')
    def close(self):self.stop();self.gate.stop();self.root.destroy()

if __name__=='__main__':
    root=tk.Tk();Application(root);root.mainloop()
