import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/loaders/DRACOLoader.js';

const container = document.getElementById("three-container");
const scene = new THREE.Scene();

// Задний свет
const backLight = new THREE.DirectionalLight(0xffffff, 2);
backLight.position.set(0, 5, -15);
backLight.target.position.set(0, 0, 0);
scene.add(backLight);
scene.add(backLight.target);

// Фронтальный свет
const frontLight = new THREE.DirectionalLight(0xffffff, 0.5);
frontLight.position.set(0, 5, 10);
scene.add(frontLight);

// Ambient
const ambient = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambient);

// Камера
const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 100);
camera.position.set(0,1.5,5);

// Рендерер
const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// Loader
const loader = new THREE.GLTFLoader();
const dracoLoader = new THREE.DRACOLoader();
dracoLoader.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.161.0/examples/js/libs/draco/");
loader.setDRACOLoader(dracoLoader);

let targetMesh;

loader.load("https://thehead.digital/js/lenseslogo.glb", function(gltf){
    scene.add(gltf.scene);

    // Стеклянный материал для цилиндров
    const glassMeshes = ["Cylinder1","Cylinder2","Cylinder3"]; // точные имена
    gltf.scene.traverse(function(child){
        if(child.isMesh && glassMeshes.includes(child.name)){
            child.material = new THREE.MeshPhysicalMaterial({
                color:0xffffff,
                metalness:0,
                roughness:0,
                transparent:true,
                opacity:1,
                transmission:1,
                thickness:0.5,
                ior:1.5,
                side:THREE.DoubleSide
            });
        }
    });

    targetMesh = gltf.scene.getObjectByName("Curve");
});

// Движение мышью
let mouseX = 0;
document.addEventListener("mousemove", function(e){
    mouseX = (e.clientX/window.innerWidth)*2-1;
});

// Анимация
function animate(){
    requestAnimationFrame(animate);
    if(targetMesh) targetMesh.position.x = mouseX*2;
    renderer.render(scene, camera);
}
animate();

// Адаптивность
window.addEventListener("resize", function(){
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
