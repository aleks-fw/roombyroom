const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DATA_ROOT = process.env.ROOM_DATA_DIR || (process.platform === 'win32' ? 'D:\\Codex\\Room-by-Room' : path.join(ROOT, 'data'));
const PROJECT_NODE_MODULES = path.join(ROOT, 'node_modules');
const DATA_NODE_MODULES = path.join(DATA_ROOT, 'node_modules');
const THREE_ROOT = process.env.ROOM_NODE_MODULES || (fs.existsSync(path.join(PROJECT_NODE_MODULES, 'three')) ? PROJECT_NODE_MODULES : DATA_NODE_MODULES);
const ASSET_FILE = process.env.ROOM_ASSET_PATH || (process.platform === 'win32' ? 'D:\\Codex\\PWO-room-model\\PWO_LivingRoom.glb' : path.join(ROOT, 'assets', 'room.glb'));
const PORT = Number(process.env.PORT || 4173);
const STORAGE_BACKEND = process.env.STORAGE_BACKEND || 'sqlite';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!['sqlite','supabase'].includes(STORAGE_BACKEND)) throw new Error('STORAGE_BACKEND должен быть sqlite или supabase.');
if (STORAGE_BACKEND === 'supabase' && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) throw new Error('Для Supabase задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const importMap = indexHtml.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1] || '';
const importMapHash = crypto.createHash('sha256').update(importMap).digest('base64');
const secureCookie = process.env.NODE_ENV === 'production' ? '; Secure' : '';
const securityHeaders = {
  'Content-Security-Policy': `default-src 'self'; script-src 'self' 'sha256-${importMapHash}'; style-src 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};
fs.mkdirSync(path.join(DATA_ROOT, 'data'), { recursive: true });
const ENV_FILE = path.join(DATA_ROOT, 'owner.env');
function loadSettings() {
  const settings = {};
  if (fs.existsSync(ENV_FILE)) for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) { const i=line.indexOf('='); if(i>0) settings[line.slice(0,i).trim()]=line.slice(i+1).trim(); }
  const persistedSettings = { ...settings };
  if (process.env.OWNER_PASSWORD) settings.OWNER_PASSWORD=process.env.OWNER_PASSWORD;
  if (process.env.SESSION_SECRET) settings.SESSION_SECRET=process.env.SESSION_SECRET;
  const generated = {};
  if (!settings.OWNER_PASSWORD) settings.OWNER_PASSWORD=generated.OWNER_PASSWORD=crypto.randomBytes(16).toString('base64url');
  if (!settings.SESSION_SECRET) settings.SESSION_SECRET=generated.SESSION_SECRET=crypto.randomBytes(48).toString('base64url');
  if (Object.keys(generated).length) {
    const persisted = { ...persistedSettings, ...generated };
    fs.writeFileSync(ENV_FILE, Object.entries(persisted).map(([key,value])=>`${key}=${value}`).join('\n')+'\n',{mode:0o600});
    console.log(`Созданы данные входа владельца: ${ENV_FILE}`);
  }
  return settings;
}
const settings=loadSettings();
let db;
const demoServices=[
 ['Снятие старых обоев',250,'₽/м²','Демонтаж','bedroom','Аккуратное снятие обоев и подготовка поверхности.'],['Демонтаж плитки',650,'₽/м²','Демонтаж','bathroom','Снятие облицовки без вывоза строительного мусора.'],['Монтаж розетки',900,'₽/шт.','Электрика','all','Установка механизма в подготовленное место.'],['Разводка электрики',1200,'₽/точка','Электрика','all','Прокладка кабеля и монтаж подрозетника.'],['Замена смесителя',1800,'₽/шт.','Сантехника','bathroom','Демонтаж старого и установка нового смесителя.'],['Монтаж сантехнической точки',3500,'₽/точка','Сантехника','bathroom','Подключение прибора к подготовленным коммуникациям.'],['Штукатурка стен',850,'₽/м²','Выравнивание стен и потолка','all','Выравнивание по маякам при подходящем основании.'],['Шпаклёвка стен',500,'₽/м²','Выравнивание стен и потолка','all','Подготовка поверхности под финишную отделку.'],['Покраска стен',420,'₽/м²','Покраска и отделка','bedroom','Грунтование и нанесение двух слоёв краски.'],['Покраска потолка',480,'₽/м²','Покраска и отделка','all','Подготовка и покраска потолка интерьерным составом.'],['Укладка плитки',2500,'₽/м²','Укладка плитки','bathroom','Укладка плитки на подготовленное основание.'],['Затирка швов',350,'₽/м²','Укладка плитки','bathroom','Заполнение межплиточных швов затирочным составом.'],['Укладка ламината',650,'₽/м²','Напольные покрытия','bedroom','Укладка на ровное основание с подложкой.'],['Укладка инженерной доски',1400,'₽/м²','Напольные покрытия','living','Монтаж плавающим способом или на клей.'],['Установка межкомнатной двери',6500,'₽/шт.','Установка дверей','all','Монтаж коробки, полотна и наличников.'],['Монтаж плинтуса',300,'₽/п.м.','Дополнительные работы','all','Подрезка и монтаж напольного плинтуса.'],['Вынос строительного мусора',2500,'₽/услуга','Дополнительные работы','all','Сбор и вынос мешков до контейнера на территории.'],['Фартук из плитки',2700,'₽/м²','Укладка плитки','kitchen','Облицовка рабочей зоны кухни плиткой.']
];
function initializeSqlite(){
 db=new DatabaseSync(path.join(DATA_ROOT,'data','room-by-room.sqlite'));
 db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS services(id INTEGER PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL, unit TEXT NOT NULL, category TEXT NOT NULL, zone TEXT NOT NULL DEFAULT 'all', description TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS requests(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL, callback_time TEXT NOT NULL, comment TEXT NOT NULL DEFAULT '', consent INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'Новая', note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));`);
 const insert=db.prepare('INSERT INTO services(name,price,unit,category,zone,description) VALUES(?,?,?,?,?,?)');
 if(db.prepare('SELECT COUNT(*) n FROM services').get().n===0){db.exec('BEGIN');try{for(const s of demoServices)insert.run(...s);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
}
async function supabaseRequest(table,query='',method='GET',body,prefer=''){const url=`${SUPABASE_URL}/rest/v1/${table}${query?`?${query}`:''}`;const response=await fetch(url,{method,headers:{apikey:SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.text();if(!response.ok)throw new Error(`Supabase ${table}: HTTP ${response.status} ${data.slice(0,240)}`);return data?JSON.parse(data):null;}
async function initializeStorage(){if(STORAGE_BACKEND==='sqlite'){initializeSqlite();return;}const rows=await supabaseRequest('services','select=id&limit=1');if(rows.length===0)await supabaseRequest('services','', 'POST',demoServices.map(([name,price,unit,category,zone,description])=>({name,price,unit,category,zone,description,active:true})));}
const sessionMap=new Map(), loginAttempts=new Map();
const statuses=['Новая','Связались','На замере','Смета отправлена','Завершена','Отменена'];
function safeEqual(a,b){const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function cookie(req,name){return (req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${name}=`))?.slice(name.length+1)||'';}
function authorized(req){const token=cookie(req,'rb_owner');if(!token)return false;const [id,sig]=decodeURIComponent(token).split('.');const expected=crypto.createHmac('sha256',settings.SESSION_SECRET).update(id||'').digest('base64url');const session=sessionMap.get(id);return !!session&&session.expires>Date.now()&&safeEqual(sig||'',expected);}
function json(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));}
function readBody(req){return new Promise((resolve,reject)=>{let body='';req.on('data',chunk=>{body+=chunk;if(body.length>50000){reject(new Error('Слишком большой запрос'));req.destroy();}});req.on('end',()=>{try{resolve(JSON.parse(body||'{}'));}catch{reject(new Error('Некорректные данные'));}});req.on('error',reject);});}
function clean(s,max){return String(s??'').trim().slice(0,max);}
function text(res,status,message){json(res,status,{error:message});}
async function serviceRows(activeOnly=false){if(STORAGE_BACKEND==='supabase'){const rows=await supabaseRequest('services',`select=id,name,price,unit,category,zone,description,active${activeOnly?'&active=eq.true':''}&order=category.asc,name.asc`);return rows.map(s=>({...s,active:Boolean(s.active)}));}return db.prepare(`SELECT id,name,price,unit,category,zone,description,active FROM services ${activeOnly?'WHERE active=1':''} ORDER BY category,name`).all().map(s=>({...s,active:Boolean(s.active)}));}
async function requestRows(){if(STORAGE_BACKEND==='supabase')return supabaseRequest('requests','select=id,name,phone,address,callback_time,comment,status,note,created_at&order=id.desc');return db.prepare('SELECT id,name,phone,address,callback_time,comment,status,note,created_at FROM requests ORDER BY id DESC').all();}
function sendAsset(req,res,data,contentType,cacheControl){const headers={'Content-Type':contentType,'Cache-Control':cacheControl,'Vary':'Accept-Encoding'};const acceptsGzip=/\bgzip\b/.test(req.headers['accept-encoding']||'');if(acceptsGzip){data=zlib.gzipSync(data,{level:zlib.constants.Z_BEST_SPEED});headers['Content-Encoding']='gzip';}res.writeHead(200,headers);res.end(data);}
function staticFile(req,res,filename){const full=path.resolve(ROOT,filename);if(!full.startsWith(path.resolve(ROOT)+path.sep)){res.writeHead(403);return res.end();}fs.readFile(full,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}const ext=path.extname(full);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};sendAsset(req,res,data,types[ext]||'application/octet-stream',ext==='.html'||ext==='.js'||ext==='.css'?'no-cache':'public, max-age=900');});}
function vendorFile(req,res,requestPath){const root=path.resolve(THREE_ROOT,'three');let relative;try{relative=decodeURIComponent(requestPath.slice('/vendor/three/'.length));}catch{return text(res,400,'Некорректный путь.');}const full=path.resolve(root,relative);if(!full.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(full,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}const ext=path.extname(full);const types={'.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8'};sendAsset(req,res,data,types[ext]||'application/octet-stream','public, max-age=86400');});}
const server=http.createServer(async(req,res)=>{
 try{
  for(const [name,value] of Object.entries(securityHeaders))res.setHeader(name,value);
  const url=new URL(req.url,'http://localhost');const p=url.pathname.replace(/\/$/,'')||'/';
  if(req.method==='GET'&&p.startsWith('/vendor/three/'))return vendorFile(req,res,p);
  if(req.method==='GET'&&p==='/api/config')return json(res,200,{threeD:true,backend:true});
  if(req.method==='GET'&&p==='/api/services')return json(res,200,await serviceRows(true));
  if(req.method==='POST'&&p==='/api/requests'){
   const d=await readBody(req);const name=clean(d.name,120),phone=clean(d.phone,30),address=clean(d.address,240),callback=clean(d.callbackTime,60),comment=clean(d.comment,1200),digits=phone.replace(/\D/g,'');
   if(name.length<3||digits.length<10||digits.length>15||address.length<5||!callback||d.consent!==true&&d.consent!=='on')return text(res,400,'Проверьте обязательные поля и согласие на обработку данных.');
   if(STORAGE_BACKEND==='supabase'){const rows=await supabaseRequest('requests','', 'POST',{name,phone,address,callback_time:callback,comment,consent:true},'return=representation');return json(res,201,{ok:true,id:Number(rows[0].id)});}
   const result=db.prepare('INSERT INTO requests(name,phone,address,callback_time,comment,consent) VALUES(?,?,?,?,?,1)').run(name,phone,address,callback,comment);return json(res,201,{ok:true,id:Number(result.lastInsertRowid)});
  }
  if(req.method==='POST'&&p==='/api/admin/login'){
   const ip=req.socket.remoteAddress||'local';const attempt=loginAttempts.get(ip)||{count:0,until:Date.now()};if(attempt.until>Date.now()&&attempt.count>=8)return text(res,429,'Слишком много попыток. Подождите 10 минут.');
   const d=await readBody(req);if(!safeEqual(d.password||'',settings.OWNER_PASSWORD)){const count=attempt.until>Date.now()?attempt.count+1:1;loginAttempts.set(ip,{count,until:Date.now()+600000});return text(res,401,'Неверный пароль. Проверьте файл доступа владельца.');}
   loginAttempts.delete(ip);const id=crypto.randomBytes(24).toString('base64url'),sig=crypto.createHmac('sha256',settings.SESSION_SECRET).update(id).digest('base64url');sessionMap.set(id,{expires:Date.now()+8*60*60*1000});return json(res,200,{ok:true},{'Set-Cookie':`rb_owner=${encodeURIComponent(`${id}.${sig}`)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secureCookie}`});
  }
  if(p.startsWith('/api/admin/')&&!authorized(req))return text(res,401,'Требуется авторизация владельца.');
  if(req.method==='POST'&&p==='/api/admin/logout'){const token=cookie(req,'rb_owner');const id=decodeURIComponent(token).split('.')[0];sessionMap.delete(id);return json(res,200,{ok:true},{'Set-Cookie':`rb_owner=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie}`});}
  if(req.method==='GET'&&p==='/api/admin/requests')return json(res,200,await requestRows());
  let m=p.match(/^\/api\/admin\/requests\/(\d+)$/);if(m&&req.method==='PATCH'){const d=await readBody(req);if(!statuses.includes(d.status))return text(res,400,'Неизвестный статус.');if(STORAGE_BACKEND==='supabase')await supabaseRequest('requests',`id=eq.${Number(m[1])}`,'PATCH',{status:d.status,note:clean(d.note,1200)});else db.prepare('UPDATE requests SET status=?,note=? WHERE id=?').run(d.status,clean(d.note,1200),Number(m[1]));return json(res,200,{ok:true});}
  if(req.method==='GET'&&p==='/api/admin/services')return json(res,200,await serviceRows());
  if(req.method==='POST'&&p==='/api/admin/services'){const d=await readBody(req);const row=validateService(d);if(row.error)return text(res,400,row.error);if(STORAGE_BACKEND==='supabase'){const rows=await supabaseRequest('services','','POST',{name:row.values[0],price:row.values[1],unit:row.values[2],category:row.values[3],zone:row.values[4],description:row.values[5],active:true},'return=representation');return json(res,201,{ok:true,id:Number(rows[0].id)});}const r=db.prepare('INSERT INTO services(name,price,unit,category,zone,description) VALUES(?,?,?,?,?,?)').run(...row.values);return json(res,201,{ok:true,id:Number(r.lastInsertRowid)});}
  m=p.match(/^\/api\/admin\/services\/(\d+)(?:\/(visibility))?$/);if(m&&req.method==='PATCH'){const id=Number(m[1]);const d=await readBody(req);if(m[2]){if(STORAGE_BACKEND==='supabase')await supabaseRequest('services',`id=eq.${id}`,'PATCH',{active:Boolean(d.active)});else db.prepare('UPDATE services SET active=? WHERE id=?').run(d.active?1:0,id);}else{const row=validateService(d);if(row.error)return text(res,400,row.error);if(STORAGE_BACKEND==='supabase')await supabaseRequest('services',`id=eq.${id}`,'PATCH',{name:row.values[0],price:row.values[1],unit:row.values[2],category:row.values[3],zone:row.values[4],description:row.values[5]});else db.prepare('UPDATE services SET name=?,price=?,unit=?,category=?,zone=?,description=? WHERE id=?').run(...row.values,id);}return json(res,200,{ok:true});}
  if(req.method==='GET'&&p==='/assets/room.glb'){fs.readFile(ASSET_FILE,(err,data)=>{if(err)return text(res,404,'3D-модель не найдена.');sendAsset(req,res,data,'model/gltf-binary','public, max-age=3600');});return;}
  if(req.method==='GET'&&p==='/favicon.ico'){res.writeHead(204);return res.end();}
  if(req.method==='GET'&&p==='/owner'){res.writeHead(308,{Location:'/admin'});return res.end();}
  if(req.method==='GET'&&p==='/owner/login'){res.writeHead(308,{Location:'/admin/login'});return res.end();}
  if(req.method==='GET'&&p==='/admin/login'){if(authorized(req)){res.writeHead(302,{Location:'/admin'});return res.end();}return staticFile(req,res,'index.html');}
  if(req.method==='GET'&&['/admin','/admin/requests'].includes(p)){if(!authorized(req)){res.writeHead(302,{Location:'/admin/login'});return res.end();}return staticFile(req,res,'index.html');}
  if(req.method==='GET'&&['/','/request','/privacy'].includes(p))return staticFile(req,res,'index.html');
  if(req.method==='GET'&&['/app.js','/viewer.js','/styles.css'].includes(p))return staticFile(req,res,p.slice(1));
  res.writeHead(404);res.end('Not found');
 }catch(e){console.error(e);if(!res.headersSent)text(res,500,'Ошибка сервера. Попробуйте позже.');}
});
const cleanupTimer=setInterval(()=>{
 const now=Date.now();
 for(const [id,session] of sessionMap)if(session.expires<=now)sessionMap.delete(id);
 for(const [ip,attempt] of loginAttempts)if(attempt.until<=now)loginAttempts.delete(ip);
},15*60*1000);
cleanupTimer.unref();
function validateService(d){const name=clean(d.name,120),price=Number(d.price),unit=clean(d.unit,30),category=clean(d.category,100),zone=clean(d.zone,20),description=clean(d.description,300);if(!name||!Number.isFinite(price)||price<1||price>10000000||!unit||!categories.includes(category)||!['all','kitchen','bathroom','toilet','bedroom','room12','living','hallway'].includes(zone)||!description)return{error:'Заполните все поля услуги корректно.'};return{values:[name,Math.round(price),unit,category,zone,description]};}
const categories=['Демонтаж','Электрика','Сантехника','Выравнивание стен и потолка','Покраска и отделка','Укладка плитки','Напольные покрытия','Установка дверей','Дополнительные работы'];
initializeStorage().then(()=>server.listen(PORT,'0.0.0.0',()=>console.log(`Room by Room запущен: http://localhost:${PORT}; хранилище: ${STORAGE_BACKEND}`))).catch(e=>{console.error('Не удалось подключить хранилище:',e.message);process.exit(1);});
