#!/usr/bin/env python3
"""SenseNova 生图本地服务：突破 15s UI 限制，浏览器端负责交互，服务端调商汤 API。
启动: python3 server.py <port>
"""
import json, os, sys, base64, time, io, socket, re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import urllib.request

CONFIG_PATH = "/sdcard/Download/Operit/plugins/draw/sensenova_sidebar/config.json"
OUT_DIR = "/sdcard/Download/Operit/plugins/draw/sensenova_sidebar/draws"
API_URL = "https://token.sensenova.cn/v1/images/generations"
EDIT_URL = "https://token.sensenova.cn/v1/images/edits"
DEFAULT_MODEL = "sensenova-u1.5-lite"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8899

os.makedirs(OUT_DIR, exist_ok=True)

def get_key():
    for p in [CONFIG_PATH, "/sdcard/Download/Operit/plugins/draw/sensenova_sidebar/config.json"]:
        try:
            if os.path.exists(p):
                with open(p) as f:
                    c = json.load(f)
                if c.get("api_key"):
                    return c["api_key"].strip()
        except Exception:
            pass
    return ""

def http_post_json(url, body, api_key, retries=3):
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"),
                headers={"Content-Type": "application/json", "Authorization": "Bearer " + api_key,
                         "accept": "application/json"})
            with urllib.request.urlopen(req, timeout=180) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            last_err = e
            code = getattr(e, "code", 0)
            # 429/5xx 是临时性错误，等一会重试
            if code in (429, 500, 502, 503, 504):
                wait = 20 * (attempt + 1)
                time.sleep(wait)
                continue
            raise
    raise last_err

def download(url, path):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=180) as resp, open(path, "wb") as f:
        f.write(resp.read())

def generate(prompt, api_key):
    body = {"model": DEFAULT_MODEL, "prompt": prompt,
            "size": "1024x1024", "response_format": "url", "output_format": "png", "watermark": False}
    parsed = http_post_json(API_URL, body, api_key)
    url = (parsed.get("data") or [{}])[0].get("url", "")
    if not url:
        return {"ok": False, "error": "商汤未返回图片 URL: " + json.dumps(parsed)[:200]}
    path = OUT_DIR + "/img_" + str(int(time.time()*1000)) + ".png"
    download(url, path)
    return {"ok": True, "file_path": path, "file_uri": "file://" + path,
            "markdown": "![AI生成的图片](file://" + path + ")"}

def edit(prompt, image_path, api_key):
    with open(image_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    mime = "image/png"
    if image_path.lower().endswith((".jpg",".jpeg")): mime = "image/jpeg"
    elif image_path.lower().endswith(".webp"): mime = "image/webp"
    data_url = "data:" + mime + ";base64," + b64
    body = {"model": DEFAULT_MODEL, "images": [{"image_url": data_url}], "prompt": prompt,
            "n": 1, "size": "auto", "watermark": False, "prompt_extend": True, "response_format": "url"}
    parsed = http_post_json(EDIT_URL, body, api_key)
    url = (parsed.get("data") or [{}])[0].get("url", "")
    if not url:
        return {"ok": False, "error": "商汤未返回编辑图片 URL: " + json.dumps(parsed)[:200]}
    path = OUT_DIR + "/edit_" + str(int(time.time()*1000)) + ".png"
    download(url, path)
    return {"ok": True, "file_path": path, "file_uri": "file://" + path,
            "markdown": "![AI编辑的图片](file://" + path + ")"}

HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:16px;background:#fff;color:#222}
h1{font-size:18px;margin:0 0 12px}
.field{margin-bottom:14px}
label{display:block;font-size:13px;margin-bottom:6px;color:#555}
textarea{width:100%;min-height:72px;border:1px solid #ccc;border-radius:8px;padding:10px;font-size:14px;box-sizing:border-box;resize:vertical}
.btn{width:100%;padding:12px;border:0;border-radius:8px;font-size:15px;cursor:pointer;margin-bottom:8px;box-sizing:border-box}
.btn-add{background:#f0f0f0;color:#333}
.btn-gen{background:#7c4dff;color:#fff;font-weight:bold}
.btn:disabled{opacity:.5;cursor:not-allowed}
.img-pick{display:none}
#status{display:none;margin:12px 0;padding:12px;background:#f5f3ff;border-radius:8px;font-size:14px}
#progress-bar{display:none;height:8px;background:#eee;border-radius:4px;overflow:hidden;margin-top:8px}
#progress-fill{height:100%;width:0;background:#7c4dff;transition:width .3s}
#preview{display:none;margin-top:12px}
#preview img{max-width:100%;border-radius:8px;border:1px solid #eee}
#picked{display:none;margin:8px 0;font-size:13px;color:#555;align-items:center;gap:8px}
#picked img{width:44px;height:44px;object-fit:cover;border-radius:6px}
#cfgmsg{font-size:12px;margin-bottom:10px}
.ok{color:#2E7D32}.err{color:#C62828}
</style></head>
<body>
<h1>商汤生图</h1>
<div id="cfgmsg">检测中...</div>
<div class="field"><label>提示词</label><textarea id="prompt" placeholder="输入想要生成的图片描述"></textarea></div>
<input type="file" id="fileinput" class="img-pick" accept="image/*">
<button class="btn btn-add" id="addbtn">添加图片</button>
<div id="picked"><img id="pickthumb"><span id="pickname">已添加图片</span></div>
<button class="btn btn-gen" id="genbtn">开始生成</button>
<div id="status"></div>
<div id="progress-bar"><div id="progress-fill"></div></div>
<div id="preview"><label>预览</label><img id="previewimg"></div>
<script>
let pickedPath = "";
const cfgmsg=document.getElementById('cfgmsg');
const promptEl=document.getElementById('prompt');
const fileinput=document.getElementById('fileinput');
const addbtn=document.getElementById('addbtn');
const picked=document.getElementById('picked');
const pickthumb=document.getElementById('pickthumb');
const pickname=document.getElementById('pickname');
const genbtn=document.getElementById('genbtn');
const statusEl=document.getElementById('status');
const progressBar=document.getElementById('progress-bar');
const progressFill=document.getElementById('progress-fill');
const preview=document.getElementById('preview');
const previewimg=document.getElementById('previewimg');
function setStatus(t,c){statusEl.style.display='block';statusEl.textContent=t;if(c)statusEl.className=c;else statusEl.className='';}
function setProgress(p){progressBar.style.display='block';progressFill.style.width=p+'%';}
fetch('/api/config').then(r=>r.json()).then(d=>{
  cfgmsg.textContent = d.configured ? '已配置 API Key' : '未配置 API Key';
  cfgmsg.className = d.configured ? 'ok' : 'err';
}).catch(()=>{cfgmsg.textContent='配置检测失败';cfgmsg.className='err';});
addbtn.onclick=()=>fileinput.click();
fileinput.onchange=()=>{
  const f=fileinput.files[0]; if(!f) return;
  const url=URL.createObjectURL(f);
  pickthumb.src=url; pickname.textContent='已添加图片 ('+f.name+')';
  picked.style.display='flex';
  // 读取为 dataURL 用于编辑
  const reader=new FileReader();
  reader.onload=()=>{ pickedPath=reader.result; };
  reader.readAsDataURL(f);
};
genbtn.onclick=async()=>{
  const prompt=promptEl.value.trim();
  if(!prompt){setStatus('请输入提示词','err');return;}
  genbtn.disabled=true; preview.style.display='none'; setProgress(5);
  setStatus('连接服务...');
  let body;
  if(pickedPath){ body=JSON.stringify({prompt, image_data:pickedPath}); setStatus('AI 编辑中...'); }
  else { body=JSON.stringify({prompt}); setStatus('正在生成图片...'); }
  setProgress(15);
  try{
    const resp=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body});
    setProgress(40);
    const d=await resp.json();
    if(d.ok){
      setProgress(95);
      setStatus('处理完成', 'ok');
      // 通过轮询模拟剩余进度到100
      setProgress(100);
      preview.style.display='block';
      // file:// 不能直接显示, 用服务端代理取图
      const imgResp=await fetch('/api/image?path='+encodeURIComponent(d.file_path));
      if(imgResp.ok){ const blob=await imgResp.blob(); previewimg.src=URL.createObjectURL(blob); }
      else { previewimg.src='file://'+d.file_path; }
    } else {
      setProgress(0); setStatus(d.error||'失败','err');
    }
  }catch(e){ setProgress(0); setStatus('异常: '+e.message,'err'); }
  genbtn.disabled=false; setTimeout(()=>{progressBar.style.display='none';},400);
};
</script>
</body></html>"""

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, body, ctype="application/json"):
        self.send_response(code); self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        if self.path == "/" or self.path.startswith("/index"):
            self._send(200, HTML.encode("utf-8"), "text/html; charset=utf-8")
        elif self.path == "/api/config":
            key = get_key()
            self._send(200, json.dumps({"configured": bool(key)}).encode("utf-8"))
        elif self.path.startswith("/api/image?"):
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            p = q.get("path", [""])[0]
            # 只允许 draws 目录
            if p.startswith("/storage/emulated/0/Download/Operit/plugins/draw/sensenova_sidebar/draws/") and os.path.exists(p):
                with open(p, "rb") as f: data = f.read()
                ctype = "image/png"
                if p.lower().endswith((".jpg",".jpeg")): ctype="image/jpeg"
                elif p.lower().endswith(".webp"): ctype="image/webp"
                self._send(200, data, ctype)
            else:
                self._send(404, b"not found")
        else:
            self._send(404, b"not found")
    def do_POST(self):
        if self.path == "/api/generate":
            try:
                ln = int(self.headers.get("Content-Length", 0))
                data = json.loads(self.rfile.read(ln).decode("utf-8"))
                prompt = (data.get("prompt") or "").strip()
                if not prompt:
                    self._send(400, json.dumps({"ok":False,"error":"请输入提示词"}).encode("utf-8")); return
                key = get_key()
                if not key:
                    self._send(400, json.dumps({"ok":False,"error":"未配置 API Key"}).encode("utf-8")); return
                image_data = data.get("image_data") or ""
                if image_data:
                    # 把 dataURL 存成临时文件再编辑
                    m = re.match(r"data:([^;]+);base64,(.*)", image_data, re.S)
                    if m:
                        ext = ".png"; mime=m.group(1)
                        if "jpeg" in mime: ext=".jpg"
                        elif "webp" in mime: ext=".webp"
                        tmp = OUT_DIR + "/_tmp_" + str(int(time.time()*1000)) + ext
                        with open(tmp,"wb") as f: f.write(base64.b64decode(m.group(2)))
                        result = edit(prompt, tmp, key)
                        try: os.remove(tmp)
                        except: pass
                        self._send(200, json.dumps(result).encode("utf-8")); return
                result = generate(prompt, key)
                self._send(200, json.dumps(result).encode("utf-8"))
            except Exception as e:
                self._send(500, json.dumps({"ok":False,"error":"服务异常: "+str(e)}).encode("utf-8"))
        else:
            self._send(404, b"not found")

if __name__ == "__main__":
    # 确保 /sdcard 下文件能被读取（proot 已挂载）
    print("SenseNova server starting on port", PORT)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.serve_forever()