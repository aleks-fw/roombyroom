import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let renderer, scene, camera, controls, apartment, raycaster, pointer, zoneMeshes = [], activeZone = 'living', fitScale = 1;
const colors = { kitchen:0xd8c4a8,bathroom:0xb8d3d2,toilet:0xe1ded4,bedroom:0xd7cfc0,room12:0xcac9b8,living:0xd1bd9e,hallway:0xe8e2d5 };
const centers = { living:[-3.02,0,-3.13],bedroom:[2.9,0,-3.13],room12:[-4.46,0,0],kitchen:[-5.07,0,3.14],bathroom:[-2.99,0,3.89],toilet:[-1.97,0,3.89],hallway:[-.73,0,.72] };
const roomSizes = { living:[7,2.9],bedroom:[4.36,2.9],room12:[4.12,2.9],kitchen:[2.9,2.9],bathroom:[1.26,1.42],toilet:[.78,1.42] };
function material(color, roughness=.8) { return new THREE.MeshStandardMaterial({color,roughness}); }
function box(parent, zone, name, x,y,z,w,h,d,color,roughness=.8) { const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color,roughness)); mesh.position.set(x,y,z); mesh.name=name; mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh; }
function cylinder(parent,name,x,y,z,top,bottom,height,color,segments=20) { const mesh=new THREE.Mesh(new THREE.CylinderGeometry(top,bottom,height,segments),material(color));mesh.position.set(x,y,z);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh; }
function sphere(parent,name,x,y,z,sx,sy,sz,color) { const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,20,14),material(color,.45));mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh; }
function plant(parent,zone,x,z,scale=1) { cylinder(parent,`${zone}-plant-pot`,x,.15*scale,z,.13*scale,.17*scale,.3*scale,0xba8761,16);cylinder(parent,`${zone}-plant-stem`,x,.48*scale,z,.025*scale,.03*scale,.38*scale,0x526e4e,10);for(let i=0;i<5;i++){const angle=i*Math.PI*.4;const leaf=sphere(parent,`${zone}-plant-leaf`,x+Math.cos(angle)*.12*scale,.61*scale+(i%2)*.05*scale,z+Math.sin(angle)*.12*scale,.07*scale,.19*scale,.055*scale,0x688761);leaf.rotation.z=Math.cos(angle)*.45;leaf.rotation.x=Math.sin(angle)*.4;} }
function buildRoom(zone) {
 const [x,y,z]=centers[zone],[w,d]=roomSizes[zone],group=new THREE.Group();group.position.set(x,y,z);group.userData.zone=zone;apartment.add(group);
 const floor=box(group,zone,`floor-${zone}`,0,.05,0,w+.1,.02,d+.1,colors[zone]);floor.userData.zone=zone;zoneMeshes.push(floor);
 const furniture=new THREE.Group();furniture.scale.setScalar(Math.min(w/2.6,d/2.6));group.add(furniture);return furniture;
}
function wallPiece(name,x,z,w,d){return box(apartment,'wall',name,x,.58,z,w,1.2,d,0xe8e5dc);}
function wallH(name,z,x1,x2,door=null){const t=.2;if(!door)return wallPiece(name,(x1+x2)/2,z,x2-x1+.24,t);const[a,b]=door;wallPiece(`${name}-a`,(x1+a-b/2)/2-.1,z,a-b/2-x1+.2,t);wallPiece(`${name}-b`,(a+b/2+x2)/2+.1,z,x2-a-b/2+.2,t);addDoor(name,a,z,true,b);}
function wallV(name,x,z1,z2,doors=null){const t=.2,openings=doors?(Array.isArray(doors[0])?doors:[doors]):[];if(!openings.length)return wallPiece(name,x,(z1+z2)/2,t,z2-z1+.24);let cursor=z1;for(const [center,width] of openings.sort((a,b)=>a[0]-b[0])){const start=center-width/2,end=center+width/2;if(start>cursor){const first=cursor===z1;wallPiece(`${name}-${cursor.toFixed(2)}`,x,(cursor+start)/2-(first ? .1 : 0),t,start-cursor+(first ? .2 : 0));}addDoor(name,x,center,false,width);cursor=end;}if(cursor<z2)wallPiece(`${name}-${cursor.toFixed(2)}`,x,(cursor+z2)/2+.1,t,z2-cursor+.2);}
function addDoor(name,x,z,horizontal,width=.78){const leaf=box(apartment,'door',`${name}-door-leaf`,x,.585,z,horizontal?width:.055,1.06,horizontal?.055:width,0x9a704d);leaf.castShadow=true;return leaf;}
function buildApartmentWalls(){
 // Long central hall with doors into each room; wall sections stop at real door openings.
  wallPiece('north-exterior-left',-5.34,-4.58,2.36,.1);wallPiece('north-exterior-right',1.58,-4.58,7,.1);
  wallV('west-exterior',-6.52,-4.58,4.6,[-3.13,1.15]);wallV('bedroom-east-exterior',5.08,-4.58,-1.68);wallH('living-south',-1.68,-6.52,.48,[-.35,.88]);wallH('bedroom-south',-1.68,.72,5.08);
  // Fill the low exterior wall below the living-room window down to floor level.
  box(apartment,'wall','living-window-sill-wall',-3.02,.225,-4.58,2.28,.33,.1,0xe8e5dc);
  box(apartment,'wall','living-window-header-wall',-3.02,1.21,-4.58,2.28,.1,.1,0xe8e5dc);
  wallPiece('living-bedroom-partition',.6,-3.13,.24,3.14);wallH('room12-north',-1.45,-6.52,-2.18);wallV('room12-east',-2.18,-1.45,1.45);
  // The room/kitchen boundary is a single continuous wall; the west exterior wall already encloses the kitchen.
  wallH('room12-south',1.56,-6.52,-2.18);
  wallV('kitchen-east',-3.62,1.56,4.6,[2.8,.62]);wallH('kitchen-south',4.6,-6.52,-3.62);
  wallV('bathroom-west',-3.62,3.18,4.6);wallH('bathroom-north',3.18,-3.62,-2.36,[-2.99,.72]);wallH('bathroom-south',4.6,-3.62,-2.36);wallV('bathroom-toilet-partition',-2.36,3.18,4.6);wallH('toilet-north',3.18,-2.36,-1.58,[-1.97,.62]);wallH('toilet-south',4.6,-2.36,-1.58);wallV('toilet-east',-1.58,3.18,4.6);
  wallV('hall-east',.72,-1.68,3.4,[[-1.05,.85],[2.95,.92]]);wallH('hall-south',3.4,-1.58,.72);
  // The hall widens at the lower end to connect the kitchen, bath and WC.
 // The balcony is an exterior deck with low glazed guards, not another walled room.
}
function simpleDecor(zone, group) {
 const wood=0xa9784d, paleWood=0xc39a6f, ivory=0xf1eee5, linen=0xd8d5c9, steel=0x68716d;
 if(zone==='bathroom') {
  // One compact bathtub sized to fit this small room.
  box(group,zone,'bath-tub-shell',0,.25,0,.86,.38,1.24,0xf7f8f5,.35);
  box(group,zone,'bath-tub-water',0,.44,0,.7,.025,1.08,0xb8d9d8,.25);
  box(group,zone,'bath-tub-rim',0,.46,0,.94,.07,1.32,0xffffff,.3);
  cylinder(group,'bath-tub-drain',0,.48,.48,.045,.045,.012,steel,16);
  cylinder(group,'bath-tub-faucet',0,.59,-.56,.025,.025,.18,steel,12);
  return;
 }
 if(zone==='toilet') {
  const fixture=new THREE.Group();fixture.rotation.y=Math.PI;group.add(fixture);
  cylinder(fixture,'wc-toilet-foot',0,.23,.25,.2,.23,.4,0xf7f8f5,24);sphere(fixture,'wc-toilet-bowl',0,.43,.25,.33,.18,.29,0xffffff);box(fixture,zone,'wc-toilet-tank',0,.61,-.16,.42,.52,.23,0xf8f9f7,.35);cylinder(fixture,'wc-toilet-seat',0,.59,.25,.27,.27,.045,0xe2e7e3,24);box(fixture,zone,'wc-paper-holder',.48,.62,-.05,.07,.12,.07,steel);
  return;
 }
 if(zone==='kitchen') {
  // Continuous counter, individual doors, sink, hob and a recognizable refrigerator.
  box(group,zone,'kitchen-base-cabinets',-.16,.34,-.69,1.45,.56,.45,wood);
  for(let i=0;i<3;i++){const x=-.62+i*.46;box(group,zone,`kitchen-cabinet-front-${i}`,x,.34,-.45,.42,.48,.035,0xc49a70);cylinder(group,`kitchen-cabinet-pull-${i}`,x+.14,.36,-.423,.018,.018,.12,steel,10);}
  box(group,zone,'kitchen-countertop',-.16,.65,-.69,1.55,.09,.52,ivory);
  box(group,zone,'kitchen-sink-basin',-.55,.704,-.68,.43,.018,.3,0x839a98,.35);box(group,zone,'kitchen-sink-inner',-.55,.718,-.68,.32,.012,.21,0xb9cfcb,.3);
  cylinder(group,'kitchen-faucet-stem',-.55,.81,-.47,.025,.025,.19,steel,12);cylinder(group,'kitchen-faucet-spout',-.55,.9,-.55,.022,.022,.17,steel,12).rotation.x=Math.PI/2;
  box(group,zone,'kitchen-hob',.12,.704,-.68,.43,.025,.38,0x343b39,.3);for(const [x,z] of [[-.02,-.78],[.24,-.78],[-.02,-.57],[.24,-.57]])cylinder(group,'kitchen-burner',x,.725,z,.075,.075,.018,0x1d2422,16);
  box(group,zone,'kitchen-fridge-body',.88,.72,-.76,.32,1.34,.48,0xe9ebe5,.45);box(group,zone,'kitchen-fridge-freezer',.88,1.21,-.505,.28,.36,.018,0xf4f4ef,.4);cylinder(group,'kitchen-fridge-handle',.99,.78,-.48,.018,.018,.24,steel,10);
  box(group,zone,'kitchen-dining-table',-.22,.48,.54,.77,.11,.6,paleWood);for(const [x,z] of [[-.5,.32],[.06,.32],[-.5,.76],[.06,.76]])box(group,zone,'kitchen-table-leg',x,.26,z,.055,.43,.055,wood);
  for(const [x,z,side] of [[-.74,.53,-1],[.3,.53,1]]){box(group,zone,'kitchen-chair-seat',x,.27,z,.29,.08,.3,0x8e7054);for(const dx of [-.1,.1])for(const dz of [-.1,.1])box(group,zone,'kitchen-chair-leg',x+dx,.14,z+dz,.035,.24,.035,wood);const back=box(group,zone,'kitchen-chair-back',x+side*.14,.48,z,.28,.36,.055,0x9e805f);back.rotation.y=side*Math.PI/2;}
  plant(group,zone,.52,.5,.52);
 }
 if(zone==='bathroom') {
  // White enamel tub, toilet, pedestal sink and clear mirror/faucet details.
  box(group,zone,'bath-tub-shell',-.3,.27,-.7,.94,.45,.69,0xf8faf8,.35);box(group,zone,'bath-tub-water',-.3,.48,-.7,.78,.035,.51,0xb8d9d8,.25);box(group,zone,'bath-tub-rim',-.3,.51,-.7,1,.065,.75,0xffffff,.3);
  cylinder(group,'bath-shower-riser',.12,.62,-.9,.025,.025,.62,steel,12);cylinder(group,'bath-shower-head',.12,.96,-.9,.035,.04,.18,steel,12).rotation.z=Math.PI/2;
  // Toilet tank sits against the left wall; the bowl faces into the room (+X).
  cylinder(group,'bath-toilet-foot',-.81,.22,.55,.2,.24,.38,0xf7f8f5,24);sphere(group,'bath-toilet-bowl',-.79,.43,.55,.34,.18,.29,0xffffff);box(group,zone,'bath-toilet-tank',-1.15,.56,.55,.2,.5,.4,0xf8f9f7,.35);cylinder(group,'bath-toilet-seat',-.79,.57,.55,.27,.27,.045,0xe2e7e3,24);
  // Vanity and wall mirror face each other; mirror is turned onto the side wall.
  box(group,zone,'bath-vanity',.93,.36,-.7,.54,.52,.44,0xb59673);sphere(group,'bath-sink-basin',.93,.64,-.7,.25,.11,.17,0xffffff);cylinder(group,'bath-sink-faucet',1.1,.77,-.7,.018,.018,.2,steel,10);
  const mirror=box(group,zone,'bath-mirror',1.24,.68,-.7,.49,.5,.035,0x9bb3b0,.25);mirror.rotation.y=-Math.PI/2;const mirrorFrame=box(group,zone,'bath-mirror-frame-top',1.24,.91,-.7,.55,.035,.05,wood);mirrorFrame.rotation.y=-Math.PI/2;
  box(group,zone,'bath-mat',-.32,.09,.99,.55,.025,.3,0xb8c8bd);
 }
 if(zone==='bedroom'||zone==='room12') {
  // Full bed with layered bedding, matching pillows, bedside table and wardrobe.
  box(group,zone,'bed-frame',-.03,.24,-.38,1.34,.32,1.38,wood);box(group,zone,'bed-mattress',-.03,.45,-.42,1.28,.18,1.27,ivory);
  box(group,zone,'bed-duvet',-.03,.57,-.24,1.24,.1,.84,0x9eafa1);box(group,zone,'bed-throw',-.03,.63,.07,1.24,.045,.28,0xc69e77);
  for(const x of [-.36,.3])box(group,zone,'bed-pillow',x,.59,-.88,.52,.13,.34,0xf7f5ee);
  box(group,zone,'bed-headboard',-.03,.73,-1.12,1.4,.92,.1,wood);
  box(group,zone,'bedside-table',-.98,.31,-.83,.32,.55,.34,paleWood);box(group,zone,'bedside-drawer',-.98,.35,-.65,.26,.17,.025,0xd4b28b);cylinder(group,'bedside-lamp-stem',-.98,.72,-.83,.025,.025,.2,steel,10);cylinder(group,'bedside-lamp-shade',-.98,.86,-.83,.11,.07,.15,0xe9d9b9,16);
  // The wardrobe is tucked into the back-right corner, clear of the bed.
  box(group,zone,'bedroom-wardrobe',1.02,.61,-1,.46,1.1,.5,0xc5a178);box(group,zone,'wardrobe-left-door',.905,.61,-.735,.22,1.02,.025,0xd9bd9c);box(group,zone,'wardrobe-right-door',1.135,.61,-.735,.22,1.02,.025,0xd9bd9c);cylinder(group,'wardrobe-handle-left',.99,.61,-.71,.015,.015,.18,steel,10);cylinder(group,'wardrobe-handle-right',1.12,.61,-.71,.015,.015,.18,steel,10);
  box(group,zone,'bedroom-rug',-.03,.085,.34,1.65,.025,1.5,0xe5dfd2);
 }
 if(zone==='living') {
  // Window glazing and frame sit inside the living room on its exterior wall.
  const glass=new THREE.Mesh(new THREE.BoxGeometry(2,.547,.025),new THREE.MeshStandardMaterial({color:0x9ccbd8,roughness:.2,metalness:.04,transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide}));
  glass.position.set(0,.695,-1.25);glass.name='living-window-glass';group.add(glass);
  box(group,zone,'living-window-frame-left',-1.05,.695,-1.25,.07,.691,.08,wood);box(group,zone,'living-window-frame-right',1.05,.695,-1.25,.07,.691,.08,wood);
  box(group,zone,'living-window-frame-top',0,1.004,-1.25,2.2,.07,.08,wood);box(group,zone,'living-window-frame-bottom',0,.386,-1.25,2.2,.07,.08,wood);
  box(group,zone,'living-window-mullion-vertical',0,.695,-1.21,.045,.547,.04,wood);box(group,zone,'living-window-mullion-horizontal',0,.695,-1.21,2,.045,.04,wood);
 }
}
function buildBalcony(){
 const deckColor=0x987451,railColor=0x66736d;
 box(apartment,'balcony','balcony-deck',-7.36,.05,-3.13,1.68,.02,2.9,deckColor);
 for(let i=0;i<7;i++)box(apartment,'balcony',`balcony-deck-board-${i}`,-8.08+i*.23,.065,-3.13,.205,.018,2.82,i%2?0xa27d58:0x8e6c4a);
 const glassMat=new THREE.MeshStandardMaterial({color:0xb8d4d5,roughness:.3,metalness:.12,transparent:true,opacity:.38,depthWrite:false});
 const outerGlass=new THREE.Mesh(new THREE.BoxGeometry(.028,.58,2.72),glassMat);outerGlass.position.set(-8.17,.46,-3.13);outerGlass.name='balcony-glass-guard';apartment.add(outerGlass);
 for(const z of [-4.52,-3.95,-3.38,-2.81,-2.24,-1.74])box(apartment,'balcony','balcony-outer-post',-8.17,.45,z,.055,.74,.055,railColor);
 box(apartment,'balcony','balcony-outer-top-rail',-8.17,.83,-3.13,.075,.075,2.86,railColor);box(apartment,'balcony','balcony-outer-bottom-rail',-8.17,.09,-3.13,.055,.04,2.86,railColor);
 for(const z of [-4.55,-1.71]){const panel=new THREE.Mesh(new THREE.BoxGeometry(1.54,.58,.028),glassMat);panel.position.set(-7.36,.46,z);panel.name='balcony-side-glass-guard';apartment.add(panel);for(const x of [-8.12,-7.55,-6.58])box(apartment,'balcony','balcony-side-post',x,.45,z,.055,.74,.055,railColor);box(apartment,'balcony','balcony-side-top-rail',-7.36,.83,z,1.62,.075,.075,railColor);box(apartment,'balcony','balcony-side-bottom-rail',-7.36,.09,z,1.62,.04,.055,railColor);}
 // Compact outdoor bistro set and a potted plant make the space read as a balcony.
 cylinder(apartment,'balcony-bistro-table-leg',-7.22,.33,-3.06,.035,.035,.58,railColor,12);cylinder(apartment,'balcony-bistro-table-top',-7.22,.64,-3.06,.34,.34,.07,0xe7dfce,24);
 box(apartment,'balcony','balcony-chair-seat',-7.76,.3,-2.25,.42,.08,.42,0x77877b);box(apartment,'balcony','balcony-chair-back',-7.76,.62,-2.05,.42,.58,.07,0x77877b);
 plant(apartment,'balcony',-7.78,-4.12,.62);
}
function finishBalconyAccess(){
 const glassDoor=apartment.getObjectByName('west-exterior-door-leaf');if(!glassDoor)return;
 glassDoor.material=new THREE.MeshStandardMaterial({color:0xa8c8c7,roughness:.2,metalness:.08,transparent:true,opacity:.28,depthWrite:false});
 for(const z of [-3.66,-2.60])box(apartment,'balcony','balcony-door-frame-side',-6.52,.59,z,.08,1.14,.07,0x75543a);
 box(apartment,'balcony','balcony-door-frame-top',-6.52,1.16,-3.13,.08,.07,1.12,0x75543a);box(apartment,'balcony','balcony-door-frame-bottom',-6.52,.03,-3.13,.08,.07,1.12,0x75543a);
 box(apartment,'balcony','balcony-door-mullion',-6.48,.59,-3.13,.035,1.02,.035,0x75543a);
}
let renderFrame=0,viewerInView=true;
function scheduleRender(){
 if(renderFrame||!renderer||!viewerInView||document.hidden)return;
 renderFrame=requestAnimationFrame(()=>{
  renderFrame=0;
  if(!renderer||!viewerInView||document.hidden)return;
  const stillMoving=controls?.update();
  renderer.render(scene,camera);
  if(stillMoving)scheduleRender();
 });
}
function init() {
 const canvas=document.querySelector('#apartment-canvas'), fallback=document.querySelector('#viewer-fallback'), loader=document.querySelector('#viewer-loader'); if(!canvas||!fallback)return;
 const compact=matchMedia('(max-width: 640px)').matches||matchMedia('(pointer: coarse)').matches;
 try { renderer=new THREE.WebGLRenderer({canvas,antialias:!compact,alpha:true,powerPreference:'low-power'}); } catch(e) { loader?.remove(); return; }
 try {
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,compact?1.15:1.5)); renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.shadowMap.enabled=!compact; renderer.shadowMap.type=THREE.PCFShadowMap;
 scene=new THREE.Scene();scene.background=new THREE.Color(0xe7ece4);scene.fog=new THREE.Fog(0xe7ece4,45,70);
 camera=new THREE.PerspectiveCamera(37,1,.1,100);camera.position.set(-9.5,13,14);
 controls=new OrbitControls(camera,canvas);controls.target.set(-.6,.3,0);controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=12;controls.maxDistance=34;controls.maxPolarAngle=Math.PI*.48;
 if(matchMedia('(pointer: coarse)').matches){controls.enableRotate=false;controls.enablePan=false;controls.touches.ONE=THREE.TOUCH.PAN;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;const hint=document.querySelector('#viewer-hint');if(hint)hint.textContent='Листайте страницу одним пальцем · приближайте двумя';}
 scene.add(new THREE.HemisphereLight(0xfff8e9,0x74796f,1.7)); const key=new THREE.DirectionalLight(0xffefd1,2.35);key.position.set(-4,8,5);key.castShadow=!compact;scene.add(key);
 apartment=new THREE.Group();scene.add(apartment);zoneMeshes=[];const roomFurniture={};
 for(const zone of ['living','bedroom','room12','kitchen','bathroom','toilet']) {roomFurniture[zone]=buildRoom(zone);if(zone==='bathroom'||zone==='toilet')roomFurniture[zone].scale.setScalar(1);}
 const hall=new THREE.Group();hall.userData.zone='hallway';apartment.add(hall);for(const [x,z,w,d] of [[-.73,.86,2.9,5.08],[-2.9,2.48,1.44,1.84]]){const tile=box(hall,'hallway','floor-hallway',x,.05,z,w+.1,.02,d+.1,colors.hallway);tile.userData.zone='hallway';zoneMeshes.push(tile);}
 buildApartmentWalls();
 for(const zone of Object.keys(roomFurniture)) simpleDecor(zone,roomFurniture[zone]);
 buildBalcony();
 finishBalconyAccess();
 raycaster=new THREE.Raycaster();pointer=new THREE.Vector2();canvas.addEventListener('pointerup',onPick);canvas.addEventListener('dblclick',onDoublePick);
  controls.addEventListener('change',scheduleRender);
  for(const eventName of ['pointerdown','pointermove','pointerup','wheel'])canvas.addEventListener(eventName,scheduleRender,{passive:true});
  new ResizeObserver(()=>{resize();scheduleRender();}).observe(canvas.parentElement);resize();
  const visibilityObserver=new IntersectionObserver(([entry])=>{viewerInView=entry.isIntersecting;if(viewerInView)scheduleRender();});visibilityObserver.observe(canvas.parentElement);
  document.addEventListener('visibilitychange',scheduleRender);
  new GLTFLoader().load('/assets/room.glb',gltf=>{const model=gltf.scene,remove=[];model.traverse(o=>{const zone=o.userData?.pwo_zone,name=o.name||'';if(o.isMesh&&(zone==='floor'||zone==='window'||/\bwall\b/i.test(name))){remove.push(o);return;}if(o.isMesh){o.castShadow=!compact;o.receiveShadow=!compact;}});for(const object of remove)object.parent?.remove(object);const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());const scale=Math.min(2.7/size.x,2.2/size.z,1.7/size.y);model.scale.setScalar(scale);model.position.set(centers.living[0]-center.x*scale,.08-bounds.min.y*scale,centers.living[2]-center.z*scale);apartment.add(model);fallback.hidden=true;canvas.hidden=false;loader?.remove();scheduleRender();},undefined,()=>{fallback.hidden=true;canvas.hidden=false;loader?.remove();scheduleRender();});
  document.dispatchEvent(new CustomEvent('roombyroom:three-ready'));
  document.addEventListener('roombyroom:zone',e=>focusZone(e.detail));document.addEventListener('roombyroom:camera',e=>cameraAction(e.detail));
   scheduleRender();
 } catch(e) { console.error('3D viewer unavailable',e); loader?.remove(); }
}
function resize(){if(!renderer||!camera)return;const target=document.querySelector('.viewer-wrap');const w=target?.clientWidth||560,h=target?.clientHeight||390;renderer.setSize(w,h,false);camera.aspect=w/h;const nextFit=Math.max(1,1.32/camera.aspect),ratio=nextFit/fitScale;if(controls&&Math.abs(ratio-1)>.01)camera.position.sub(controls.target).multiplyScalar(ratio).add(controls.target);fitScale=nextFit;camera.updateProjectionMatrix();scheduleRender();}
function zoneAtPointer(event){const rect=event.currentTarget.getBoundingClientRect();pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(zoneMeshes,false)[0]?.object.userData.zone;}
function onPick(event){const zone=zoneAtPointer(event);if(zone)document.dispatchEvent(new CustomEvent('roombyroom:zone-pick',{detail:zone}));}
function onDoublePick(event){const zone=zoneAtPointer(event),center=centers[zone];if(!center||!camera||!controls)return;const target=new THREE.Vector3(center[0],.45,center[2]),offset=camera.position.clone().sub(controls.target).multiplyScalar(.72);controls.target.copy(target);camera.position.copy(target).add(offset);controls.update();scheduleRender();}
function focusZone(zone){activeZone=zone;for(const floor of zoneMeshes){const active=floor.userData.zone===zone;floor.material.color.setHex(active?0xb8d7bd:colors[floor.userData.zone]);floor.material.emissive.setHex(active?0x294a34:0x000000);floor.material.emissiveIntensity=active ? 0.12 : 0;}scheduleRender();}
function cameraAction(action){if(!camera||!controls)return;if(action==='reset'){camera.position.set(-9.5,13,14);controls.target.set(-.6,.3,0);}else{const delta=action==='zoom-in' ? .86 : 1.16;camera.position.sub(controls.target).multiplyScalar(delta).add(controls.target);}scheduleRender();}
 let viewerInitialized=false;
const bootViewer=()=>{if(!viewerInitialized&&document.querySelector('#apartment-canvas')){viewerInitialized=true;viewerObserver.disconnect();init();}};
const viewerObserver=new MutationObserver(bootViewer);
viewerObserver.observe(document.body,{childList:true,subtree:true});
document.addEventListener('roombyroom:viewer-ready',bootViewer,{once:true});
bootViewer();
