import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { GLTFLoader } from "three/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/loaders/DRACOLoader.js";
import { RGBELoader } from "three/loaders/RGBELoader.js";

// ===== Сцена, камера, рендер =====
const container = document.getElementById('three-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.15, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.useLegacyLights = false;
container.appendChild(renderer.domElement);

// ===== OrbitControls =====
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.enableZoom = false;
controls.enableRotate = false; // по умолчанию вращение выключено

let rotateEnabled = false;
window.addEventListener('mousedown', e => { if(e.button===1) rotateEnabled = true; });
window.addEventListener('mouseup', e => { if(e.button===1) rotateEnabled = false; });

// ===== Свет =====
const dir1 = new THREE.DirectionalLight(0xffffff, 0.6);
dir1.position.set(5,5,5);
scene.add(dir1);

const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
dir2.position.set(-5,5,5);
scene.add(dir2);

const ambient = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambient);

// ===== HDRI окружение =====
const pmremGenerator = new THREE.PMREMGenerator(renderer);
new RGBELoader()
    .setDataType(THREE.UnsignedByteType)
    .load('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_03_1k.hdr', texture => {
        const envMap = pmremGenerator.fromEquirectangular(texture).texture;
        scene.environment = envMap;
        texture.dispose();
    });

// ===== GLTF + DRACO =====
const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
loader.setDRACOLoader(dracoLoader);

let curveMesh;
let mouseX = 0;
document.addEventListener('mousemove', e => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
});

loader.load('https://thehead.digital/js/lenseslogo.glb', gltf => {
    gltf.scene.traverse(child => {
        if(child.isMesh){
            if(child.name.includes('Cylinder')){
                child.material = new THREE.MeshPhysicalMaterial({
                    color: 0xffffff,
                    metalness: 0,
                    roughness: 0,
                    transmission: 1,
                    thickness: 0.5,
                    ior: 1.5,
                    reflectivity: 0.2,
                    clearcoat: 0.1,
                    clearcoatRoughness: 0,
                    transparent: true,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                child.renderOrder = 1;
            }
            if(child.name==='Curve'){
                child.material = new THREE.MeshStandardMaterial({color:0x111111, metalness:0, roughness:0.5});
                curveMesh = child;
            }
        }
    });
    scene.add(gltf.scene);
});

// ===== Анимация =====
function animate(){
    requestAnimationFrame(animate);
    if(curveMesh) curveMesh.position.x = mouseX * 2;
    controls.enableRotate = rotateEnabled;
    controls.update();
    renderer.render(scene, camera);
}
animate();

// ===== Resize =====
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
