
// ========================================================================================================
// === THREE.JS SPhERE ===
// ========================================================================================================

// --- Настройки по умолчанию (desktop) ---
let configDesktop = {
  numSphereDots: 400,
  numGridDots: 91,  // 13x7
  radius: 200,
  animationSpeed: 0.99,
  rotationSpeed: 0.3,
  dotColor: 0xcbcaca,
  gridCols: 13,
  gridRows: 7,
  paddingXVW: 1, // горизонтальный паддинг в vw
  paddingYVW: 3, // вертикальный паддинг в vw
  maxSphereScale: 1.5,
  smoothing: 0.1, // инерция
  pointSizeVW: 0.6 // размер точки в vw
};

// --- Настройки для мобилки ---
let configMobile = {
  numSphereDots: 200,
  numGridDots: 45, 
  radius: 150,
  animationSpeed: 0.99,
  rotationSpeed: 0.3,
  dotColor: 0xa7a7a7,
  gridCols: 5,
  gridRows: 9,
  paddingXVW: 5,
  paddingYVW: 20,
  maxSphereScale: 1.3,
  smoothing: 0.1,
  pointSizeVW: 2
};

// Текущая конфигурация
let cfg = window.innerWidth < 768 ? configMobile : configDesktop;

let scene, camera, renderer, dots, geometry, material;
let scrollProgress = 0;
let smoothedScroll = 0;
let rotY = 0;
let startPositions = null;
let startScale = 1;
let randomPositions = null;

const container = document.getElementById('webflow-sphere-container');

if (container) {
  init();
  animate();
} else {
  console.error("Контейнер с ID 'webflow-sphere-container' не найден.");
}

// easing
function easeInOutCubic(t) {
  return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;
}

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    0.1,
    2000
  );
  camera.position.z = 500;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  window.addEventListener('resize', onWindowResize, false);

  geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(cfg.numSphereDots * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const spherePositions = new Float32Array(cfg.numSphereDots * 3);
  geometry.setAttribute('spherePosition', new THREE.BufferAttribute(spherePositions, 3));

  const planePositions = new Float32Array(cfg.numSphereDots * 3);
  geometry.setAttribute('planePosition', new THREE.BufferAttribute(planePositions, 3));

  const opacities = new Float32Array(cfg.numSphereDots);
  geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));

  // --- Сфера ---
  for (let i = 0; i < cfg.numSphereDots; i++) {
    opacities[i] = 1;
    const phi = Math.acos(-1 + (2 * i) / cfg.numSphereDots);
    const theta = Math.sqrt(cfg.numSphereDots * Math.PI) * phi;
    const xSphere = cfg.radius * Math.cos(theta) * Math.sin(phi);
    const ySphere = cfg.radius * Math.sin(theta) * Math.sin(phi);
    const zSphere = cfg.radius * Math.cos(phi);

    spherePositions[i*3+0] = xSphere;
    spherePositions[i*3+1] = ySphere;
    spherePositions[i*3+2] = zSphere;
  }

  // --- Сетка ---
  calculatePlanePositions();

  // --- Случайные позиции для разлёта лишних точек ---
  generateRandomPositions();

  // --- Шейдерный материал ---
  material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(cfg.dotColor) },
      baseSize: { value: container.clientWidth * cfg.pointSizeVW / 100 }
    },
    vertexShader: `
      attribute float opacity;
      varying float vOpacity;
      uniform float baseSize;
      void main() {
        vOpacity = opacity;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = baseSize * 1.1 * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
  uniform vec3 color;
  varying float vOpacity;
  void main() {
    // координаты точки от -1 до 1
    vec2 coord = gl_PointCoord * 2.0 - 1.0;
    float dist = dot(coord, coord);
    if(dist > 1.0) discard; // отбрасываем пиксели за пределами круга
    gl_FragColor = vec4(color, vOpacity);
  }
`,
    transparent: true
  });

  dots = new THREE.Points(geometry, material);
  dots.frustumCulled = false;
  scene.add(dots);

  const trigger = document.getElementById('trigger');
  if (trigger) {
    window.addEventListener('scroll', () => {
      const scrollTop = window.scrollY;
      const triggerTop = trigger.offsetTop;
      const windowHeight = window.innerHeight;
      let progress = (scrollTop - triggerTop) / (windowHeight * cfg.animationSpeed);
      scrollProgress = Math.max(0, Math.min(1, progress));
    });
  }
}

function calculatePlanePositions() {
    const aspect = container.clientWidth / container.clientHeight;
    const fovRad = camera.fov * Math.PI / 180;
    const visibleHeight = 2 * camera.position.z * Math.tan(fovRad / 2);
    const visibleWidth = visibleHeight * aspect;

    // padding в px → world
    const paddingXPx = window.innerWidth * cfg.paddingXVW / 100;
    const paddingYPx = window.innerWidth * cfg.paddingYVW / 100;

    const worldPerPxX = visibleWidth / container.clientWidth;
    const worldPerPxY = visibleHeight / container.clientHeight;

    const paddingXWorld = paddingXPx * worldPerPxX;
    const paddingYWorld = paddingYPx * worldPerPxY;

    const spacingX = (visibleWidth - 2 * paddingXWorld) / (cfg.gridCols - 1);
    const spacingY = (visibleHeight - 2 * paddingYWorld) / (cfg.gridRows - 1);

    const offsetX = spacingX * (cfg.gridCols - 1) / 2;
    const offsetY = spacingY * (cfg.gridRows - 1) / 2;

    const planePositions = geometry.attributes.planePosition.array;

    for (let i = 0; i < cfg.numSphereDots; i++) {
        if (i < cfg.numGridDots) {
            const row = Math.floor(i / cfg.gridCols);
            const col = i % cfg.gridCols;

            planePositions[i*3+0] = col * spacingX - offsetX;
            planePositions[i*3+1] = row * spacingY - offsetY;
            planePositions[i*3+2] = 0;
        } else {
            planePositions[i*3+0] = 0;
            planePositions[i*3+1] = 0;
            planePositions[i*3+2] = 0;
        }
    }

    geometry.attributes.planePosition.needsUpdate = true;
}

function generateRandomPositions() {
    randomPositions = new Float32Array(cfg.numSphereDots * 3);
    const aspect = container.clientWidth / container.clientHeight;
    const fovRad = camera.fov * Math.PI / 180;
    const visibleHeight = 2 * camera.position.z * Math.tan(fovRad/2);
    const visibleWidth = visibleHeight * aspect;

    const planePositions = geometry.attributes.planePosition.array;

    for (let i = 0; i < cfg.numSphereDots; i++) {
        if (i < cfg.numGridDots) {
            randomPositions[i*3+0] = planePositions[i*3+0];
            randomPositions[i*3+1] = planePositions[i*3+1];
            randomPositions[i*3+2] = planePositions[i*3+2];
        } else {
            randomPositions[i*3+0] = (Math.random() - 0.5) * visibleWidth;
            randomPositions[i*3+1] = (Math.random() - 0.5) * visibleHeight;
            randomPositions[i*3+2] = (Math.random() - 0.5) * 1000;
        }
    }
}

function onWindowResize() {
  // при ресайзе подбираем конфиг
  cfg = window.innerWidth < 768 ? configMobile : configDesktop;

  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);

  material.uniforms.baseSize.value = container.clientWidth * cfg.pointSizeVW / 100;

  calculatePlanePositions();
  generateRandomPositions();
}

function animate() {
  requestAnimationFrame(animate);

  smoothedScroll += (scrollProgress - smoothedScroll) * cfg.smoothing;

  const positions = geometry.attributes.position.array;
  const spherePositions = geometry.attributes.spherePosition.array;
  const planePositions = geometry.attributes.planePosition.array;
  const opacities = geometry.attributes.opacity.array;

  const transformationStartPercent = 0.3;
  let finalProgress = 0;
  let sphereScale = 1;

  if (smoothedScroll <= transformationStartPercent) {
    const rotationProgress = smoothedScroll / transformationStartPercent;
    const rotationModifier = 1 - Math.sin(rotationProgress * Math.PI / 2);
    rotY += cfg.rotationSpeed * rotationModifier;
    dots.rotation.y = rotY * Math.PI / 180;

    sphereScale = 1 + (cfg.maxSphereScale - 1) * rotationProgress;
    dots.scale.set(sphereScale, sphereScale, sphereScale);

    for (let i = cfg.numGridDots; i < cfg.numSphereDots; i++) opacities[i] = 1;

    startPositions = null;
    for (let i = 0; i < cfg.numSphereDots; i++) {
      positions[i*3+0] = spherePositions[i*3+0] * sphereScale;
      positions[i*3+1] = spherePositions[i*3+1] * sphereScale;
      positions[i*3+2] = spherePositions[i*3+2] * sphereScale;
    }

    startScale = sphereScale;
  } else {
    finalProgress = (smoothedScroll - transformationStartPercent) / (1 - transformationStartPercent);
    finalProgress = Math.max(0, Math.min(1, easeInOutCubic(finalProgress)));

    if (!startPositions) {
      startPositions = new Float32Array(cfg.numSphereDots * 3);
      for (let i = 0; i < cfg.numSphereDots; i++) {
        startPositions[i*3+0] = positions[i*3+0];
        startPositions[i*3+1] = positions[i*3+1];
        startPositions[i*3+2] = positions[i*3+2];
      }
    }

    for (let i = 0; i < cfg.numSphereDots; i++) {
      if (i < cfg.numGridDots) {
        positions[i*3+0] = startPositions[i*3+0]*(1-finalProgress) + planePositions[i*3+0]*finalProgress;
        positions[i*3+1] = startPositions[i*3+1]*(1-finalProgress) + planePositions[i*3+1]*finalProgress;
        positions[i*3+2] = startPositions[i*3+2]*(1-finalProgress) + planePositions[i*3+2]*finalProgress;
        opacities[i] = 1;
      } else {
        positions[i*3+0] = startPositions[i*3+0]*(1-finalProgress) + randomPositions[i*3+0]*finalProgress;
        positions[i*3+1] = startPositions[i*3+1]*(1-finalProgress) + randomPositions[i*3+1]*finalProgress;
        positions[i*3+2] = startPositions[i*3+2]*(1-finalProgress) + randomPositions[i*3+2]*finalProgress;
        opacities[i] = 1 - finalProgress;
      }
    }

    dots.rotation.y = 0;

    const scale = startScale*(1-finalProgress) + 1*finalProgress;
    dots.scale.set(scale, scale, scale);
  }

  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.opacity.needsUpdate = true;

  renderer.render(scene, camera);
}

 // ========================================================================================================
 // === THREE.JS AWARDS ===
 // ========================================================================================================

function createThreeBlock(options) {
    const container = document.getElementById(options.containerId);
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width * ((options.sizePercent?.width ?? 100) / 100);
    const height = rect.height * ((options.sizePercent?.height ?? 100) / 100);

    // === Сцена, камера, рендерер ===
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 1000);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    container.appendChild(renderer.domElement);

    // === Модель ===
    let mesh = null;

    function fitModelToCamera(mesh, camera, offset = 1.6) {
        const box = new THREE.Box3().setFromObject(mesh);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        mesh.position.sub(center);

        const aspect = width / height;
        const fov = camera.fov * (Math.PI / 180);
        const scaleY = size.y / (2 * Math.tan(fov / 2));
        const scaleX = size.x / (2 * Math.tan(fov / 2) * aspect);
        const scaleFactor = options.modelScale ?? 1;
        const cameraDistance = Math.max(scaleX, scaleY) * offset / scaleFactor;

        camera.position.set(0, 0, cameraDistance);
        camera.lookAt(0, 0, 0);
    }

    if (options.modelUrl) {
        const loader = new THREE.GLTFLoader();
        loader.load(
            options.modelUrl,
            gltf => {
                mesh = gltf.scene;
                if (options.modelScale) mesh.scale.setScalar(options.modelScale);
                scene.add(mesh);
                fitModelToCamera(mesh, camera);
            },
            undefined,
            err => console.error('Ошибка загрузки модели:', err)
        );
    }

    function animate() {
        requestAnimationFrame(animate);
        if (mesh) mesh.rotation.y += options.rotationSpeed ?? 0.01;
        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
        const rect = container.getBoundingClientRect();
        const w = rect.width * ((options.sizePercent?.width ?? 100) / 100);
        const h = rect.height * ((options.sizePercent?.height ?? 100) / 100);
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    });
}

// === Примеры вызова ===
createThreeBlock({
    containerId: 'three-container-1',
    rotationSpeed: 0.01,
    modelUrl: 'https://cdn.jsdelivr.net/gh/thehead-repo/adelt-site@refs/heads/main/aw.glb',
    modelScale: 1.15,
});

createThreeBlock({
    containerId: 'three-container-2',
    rotationSpeed: 0.01,
    modelUrl: 'https://cdn.jsdelivr.net/gh/thehead-repo/adelt-site@refs/heads/main/cs.glb',
    modelScale: 1.3,
});


    // ========================================================================================================
    // === THREE.JS WAVE CORE ===
    // ========================================================================================================


document.addEventListener('DOMContentLoaded', () => {

    // ================================
    // === Определяем тач-устройство ===
    // ================================
    const isTouchDevice = () => {
        const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if ('matchMedia' in window) {
            return window.matchMedia('(pointer: coarse)').matches;
        }
        return hasTouch;
    };
    const IS_MOBILE = isTouchDevice();
    
    // Минимальное смещение для регистрации свайпа
    const SWIPE_THRESHOLD = 50; 
    // Коэффициент сглаживания, настроенный для плавного перехода
    const STEP_SMOOTHING = 0.07; 


    function createThreeWave(wrapperSelector, containerSelector, options = {}) {
        const wrapper = document.querySelector(wrapperSelector);
        const container = document.querySelector(containerSelector);
        if (!wrapper || !container) return null;

        const isVertical = options.direction === 'vertical';

        // === 1. Количество делений для мобилки ===
        let numLines = options.numLines ?? 100;
        const numLinesMobile = options.numLinesMobile ?? numLines;

        if (IS_MOBILE) {
            numLines = numLinesMobile;
        }
        // =========================================================

        const baseColor = new THREE.Color(options.baseColor ?? '#8D8D8D');
        let waveTargetColor = new THREE.Color(options.waveActiveColor ?? '#ff661a');

        const baseRatio = options.baseRatio ?? 0.1;
        const waveRatio = options.waveRatio ?? 0.4;
        const smoothing = options.smoothing ?? 0.1;
        const waveInfluenceRatio = options.waveInfluenceRatio ?? 0.05; 
        const lineThickness = options.lineThickness ?? 1;
        const centerSelector = options.centerSelector ? document.querySelector(options.centerSelector) : null;

        // === 2. Режимы движения волн на мобилке (Обновлено) ===
        const isMobileSwipeStepMode = options.isMobileSwipeStepMode ?? false; 
        const isScrollTrackMode = options.scrollTrackSelector && IS_MOBILE; 
        const scrollTrackElement = isScrollTrackMode ? document.querySelector(options.scrollTrackSelector) : null;

        const isMobileSwipeMode = (options.isMobileSwipeMode ?? IS_MOBILE) && !isMobileSwipeStepMode && !isScrollTrackMode;
        // ==========================================================

        const swipeVelocity = options.swipeVelocity ?? 0.5;
        const activeWavePosition = options.activeWavePosition ?? 0.5;

        let width = container.offsetWidth;
        let height = container.offsetHeight;

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(width / -2, width / 2, height / 2, height / -2, 1, 1000);
        camera.position.z = 10;

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(width, height);
        renderer.domElement.style.position = 'absolute';
        renderer.domElement.style.top = 0;
        renderer.domElement.style.left = 0;
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.zIndex = '0';
        renderer.domElement.style.pointerEvents = 'none';

        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }
        container.prepend(renderer.domElement);

        const lines = [];
        const totalLength = isVertical ? height : width;
        const spacing = (totalLength - numLines * lineThickness) / (numLines - 1);
        const segmentLength = lineThickness + spacing;
        const totalLinesLength = numLines * segmentLength - spacing;

        const lineGroup = new THREE.Group();
        for (let i = 0; i < numLines; i++) {
            const geometry = new THREE.PlaneGeometry(
                isVertical ? baseRatio * width : lineThickness,
                isVertical ? lineThickness : baseRatio * height
            );
            const material = new THREE.MeshBasicMaterial({ color: baseColor });
            const mesh = new THREE.Mesh(geometry, material);

            const offset = i * segmentLength;
            if (isVertical) {
                mesh.userData.initialPos = offset - height / 2;
                mesh.position.y = mesh.userData.initialPos;
                mesh.position.x = -width / 2 + (baseRatio * width) / 2;
            } else {
                mesh.userData.initialPos = offset - width / 2;
                mesh.position.x = mesh.userData.initialPos;
                mesh.position.y = 0;
            }
            lineGroup.add(mesh);
            lines.push(mesh);
        }
        scene.add(lineGroup);

        let targetPos = isVertical ? height / 2 : width / 2;
        let currentPos = targetPos;
        let totalOffset = 0; 
        let targetOffset = 0; // === НОВАЯ ПЕРЕМЕННАЯ: Целевое смещение для плавного шага ===
        let activeWaveOffset = width * activeWavePosition; 
        let velocity = 0;
        let isTouching = false;
        let lastTouchPos = 0;
        let startTouchPos = 0; 
        
        // setTotalOffset больше не используется извне, но оставляем для обратной совместимости
        const setTotalOffset = (newOffset) => {
             targetOffset = newOffset; // Изменяем целевое смещение
        };

        // === Функция обновления волны (без изменений) ===
        function updateWave(center) {
            const influenceCenter = isMobileSwipeMode
                ? (isVertical ? height : width) * activeWavePosition
                : isMobileSwipeStepMode
                    ? (isVertical ? height : width) * activeWavePosition 
                    : isScrollTrackMode
                        ? activeWaveOffset 
                        : center; 

            lines.forEach(mesh => {
                const pos = isVertical ? mesh.position.y + height / 2 : mesh.position.x + width / 2;
                const dist = Math.abs(pos - influenceCenter);
                const influence = Math.max(0, 1 - dist / (totalLength * waveInfluenceRatio)); 
                const scale = baseRatio + (waveRatio - baseRatio) * influence;

                if (isVertical) {
                    mesh.scale.x += (scale / baseRatio - mesh.scale.x) * smoothing;
                } else {
                    mesh.scale.y += (scale / baseRatio - mesh.scale.y) * smoothing;
                }
                mesh.material.color.lerpColors(baseColor, waveTargetColor, influence);
            });

            // === Центрирование элемента по волне ===
            if (centerSelector && !isVertical) {
                const isDrivenByOffset = isMobileSwipeMode || isMobileSwipeStepMode;
                const centerForElement = isScrollTrackMode ? activeWaveOffset : isDrivenByOffset ? wrapper.offsetWidth * activeWavePosition : currentPos;
                
                const blockWidth = centerSelector.offsetWidth;
                let newLeft = centerForElement - blockWidth / 2;
                newLeft = Math.max(0, Math.min(wrapper.offsetWidth - blockWidth, newLeft));
                centerSelector.style.left = `${newLeft}px`;
                centerSelector.style.top = `${container.offsetHeight - centerSelector.offsetHeight}px`;
                centerSelector.style.position = 'absolute';
                centerSelector.style.zIndex = 10;
            }
        }

        // === Слушатели ===
        if (isMobileSwipeMode) {
            // ... Логика плавного свайпа с инерцией (без изменений)
            const primaryAxis = isVertical ? 'clientY' : 'clientX';
            wrapper.addEventListener('touchstart', e => {
                if (e.touches.length === 1) {
                    isTouching = true;
                    lastTouchPos = e.touches[0][primaryAxis];
                    velocity = 0;
                }
            }, { passive: true });
            wrapper.addEventListener('touchmove', e => {
                if (!isTouching || e.touches.length !== 1) return;
                const currentTouchPos = e.touches[0][primaryAxis];
                const delta = currentTouchPos - lastTouchPos;
                totalOffset += (isVertical ? -delta : delta) * swipeVelocity;
                lastTouchPos = currentTouchPos;
            }, { passive: true });
            wrapper.addEventListener('touchend', () => { isTouching = false; });
            
        } else if (isMobileSwipeStepMode) {
            // === Логика ПЛАВНОГО ШАГОВОГО СВАЙПА для Волны 1 (Обновлено) ===
            const primaryAxis = 'clientX';
            
            wrapper.addEventListener('touchstart', e => {
                if (e.touches.length === 1) {
                    startTouchPos = e.touches[0][primaryAxis];
                    isTouching = true;
                }
            }, { passive: true });

            wrapper.addEventListener('touchmove', e => {
                // Ничего не делаем во время touchmove
            }, { passive: true });
            
            wrapper.addEventListener('touchend', e => {
                if (!isTouching) return;
                isTouching = false;
                
                const endTouchPos = e.changedTouches ? e.changedTouches[0][primaryAxis] : 0;
                const delta = endTouchPos - startTouchPos;
                
                if (Math.abs(delta) > SWIPE_THRESHOLD) {
                    const step = width / 7;
                    let moveStep = 0;
                    
                    if (delta < 0) { // Свайп влево
                        moveStep = -step;
                    } 
                    else if (delta > 0) { // Свайп вправо
                        moveStep = step;
                    }
                    
                    // Обновляем целевое смещение, которое будет плавно достигаться
                    targetOffset += moveStep; 
                }
            }, { passive: true });
            // ==========================================================

        } else if (isScrollTrackMode) {
            // === 4. Привязка АКТИВНОЙ ЧАСТИ Волн 3 и 4 к скроллу (без изменений) ===
            if (scrollTrackElement) {
                scrollTrackElement.addEventListener('scroll', () => {
                    if (!isVertical) {
                        const maxScroll = scrollTrackElement.scrollWidth - scrollTrackElement.clientWidth;
                        const scrollFraction = scrollTrackElement.scrollLeft / maxScroll;
                        activeWaveOffset = width * scrollFraction; 
                    }
                }, { passive: true });
            }
            // ====================================================================
        } else {
            // Режим движения по мышке (по умолчанию, без изменений)
            wrapper.addEventListener('mousemove', e => {
                const rect = wrapper.getBoundingClientRect();
                targetPos = isVertical
                    ? rect.height - (e.clientY - rect.top)
                    : e.clientX - rect.left;
            });
        }

        // === Логика цвета активного слайда (без изменений) ===
        function handleDynamicColor() {
            const isWave3or4 = wrapperSelector.includes('wave3') || wrapperSelector.includes('wave4');
            if (IS_MOBILE && isWave3or4) {
                waveTargetColor = new THREE.Color(options.waveActiveColor ?? '#ff661a');
                return;
            }
            const activePreview = document.querySelector('.w-slide .case_preview.active');
            if (activePreview) {
                const activeWrap = activePreview.closest('.case_preview_wrap');
                if (activeWrap && activeWrap.hasAttribute('data-wave-white')) {
                    waveTargetColor = new THREE.Color('#ffffff');
                } else {
                    waveTargetColor = new THREE.Color('#44403F');
                }
            }
        }

        // === Анимация ===
        function animate() {
            requestAnimationFrame(animate);
            handleDynamicColor();

            if (isMobileSwipeMode) {
                // Плавное движение с инерцией и зацикливанием (без изменений)
                if (!isTouching) {
                    totalOffset += velocity;
                    velocity *= 0.95;
                    if (Math.abs(velocity) < 0.01) velocity = 0;
                }
                
                lines.forEach(mesh => {
                    const currentPos = mesh.userData.initialPos + totalOffset;
                    if (isVertical) {
                        if (currentPos < -height / 2) mesh.userData.initialPos += totalLinesLength;
                        else if (currentPos > height / 2) mesh.userData.initialPos -= totalLinesLength;
                        mesh.position.y = mesh.userData.initialPos + totalOffset;
                    } else {
                        if (currentPos < -width / 2) mesh.userData.initialPos += totalLinesLength;
                        else if (currentPos > width / 2) mesh.userData.initialPos -= totalLinesLength;
                        mesh.position.x = mesh.userData.initialPos + totalOffset;
                    }
                });
                updateWave(activeWavePosition);
                
            } else if (isMobileSwipeStepMode) {
                // === Плавное движение к целевому офсету и зацикливание (Обновлено) ===
                
                // 1. Плавное движение к targetOffset
                totalOffset += (targetOffset - totalOffset) * STEP_SMOOTHING;

                // 2. Логика зацикливания
                lines.forEach(mesh => {
                    const currentPos = mesh.userData.initialPos + totalOffset;
                    
                    if (isVertical) {
                        if (currentPos < -height / 2) mesh.userData.initialPos += totalLinesLength;
                        else if (currentPos > height / 2) mesh.userData.initialPos -= totalLinesLength;
                        mesh.position.y = mesh.userData.initialPos + totalOffset;
                    } else {
                        if (currentPos < -width / 2) mesh.userData.initialPos += totalLinesLength;
                        else if (currentPos > width / 2) mesh.userData.initialPos -= totalLinesLength;
                        mesh.position.x = mesh.userData.initialPos + totalOffset;
                    }
                });
                
                updateWave(activeWavePosition);
                
            } else if (isScrollTrackMode) {
                // Скролл-трек (Волны 3, 4) - только движение линий
                totalOffset = 0; // Линии не двигаются, только активная точка
                
                lines.forEach(mesh => {
                    if (isVertical) {
                        mesh.position.y = mesh.userData.initialPos + totalOffset;
                    } else {
                        mesh.position.x = mesh.userData.initialPos + totalOffset;
                    }
                });

                updateWave(activeWaveOffset);
            }
            else {
                // Режим движения по мышке (по умолчанию, без изменений)
                currentPos += (targetPos - currentPos) * smoothing;
                updateWave(currentPos);
            }

            renderer.render(scene, camera);
        }
        animate();

        // === Остальной код (без изменений) ===
        if (!IS_MOBILE && options.dynamicColorWithCards) { 
            const caseCards = document.querySelectorAll('.case_preview_wrap');
            caseCards.forEach(card => {
                card.addEventListener('mouseenter', () => {
                    if (card.hasAttribute('data-wave-white')) {
                        waveTargetColor = new THREE.Color('#ffffff');
                    } else {
                        waveTargetColor = new THREE.Color('#44403F');
                    }
                });
            });
        }

        window.addEventListener('resize', () => {
            width = container.offsetWidth;
            height = container.offsetHeight;
            renderer.setSize(width, height);
            camera.left = width / -2;
            camera.right = width / 2;
            camera.top = height / 2;
            camera.bottom = height / -2;
            camera.updateProjectionMatrix();
            
            if (isScrollTrackMode && scrollTrackElement) {
                const maxScroll = scrollTrackElement.scrollWidth - scrollTrackElement.clientWidth;
                const scrollFraction = scrollTrackElement.scrollLeft / maxScroll;
                activeWaveOffset = width * scrollFraction;
            }
        });

        return { renderer, scene, camera, setTotalOffset };
    }


    // ==========================================================
    // === Инициализация и настройка Волн ===
    // ==========================================================

    const wave1Container = document.querySelector('.wave-height-container');
    createThreeWave('.wave-wrapper', '.wave-height-container', {
        direction: 'horizontal',
        dynamicColorWithCards: true,
        isMobileSwipeStepMode: IS_MOBILE // Активируем новый режим плавного шагового свайпа
    });
    
    // ========================================================================


    // === Вторая волна (в табе, с центрирующимся элементом) ===
    function initWave2WhenTabActive() {
        const tabPane = document.querySelector('#tab-pane-wave2');
        if (!tabPane) return;

        const initWaveOptions = {
            direction: 'horizontal',
            baseColor: '#514B49',
            waveActiveColor: '#44403F',
            centerSelector: '#wave2-center', 
            waveInfluenceRatio: 0.08,
            isMobileSwipeMode: false 
        };

        let wave2Instance = null;

        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.attributeName === 'class') {
                    if (tabPane.classList.contains('w--tab-active')) {
                        if (!tabPane.getAttribute('data-wave2-init')) {
                            wave2Instance = createThreeWave('#wave2', '#wave2-container', initWaveOptions);
                            tabPane.setAttribute('data-wave2-init', 'true');
                        }
                    }
                }
            });
        });

        observer.observe(tabPane, { attributes: true, attributeFilter: ['class'] });

        if (tabPane.classList.contains('w--tab-active')) {
            wave2Instance = createThreeWave('#wave2', '#wave2-container', initWaveOptions);
            tabPane.setAttribute('data-wave2-init', 'true');
        }
    }
    initWave2WhenTabActive();


    // === Третья волна (Горизонтальная, скролл-трек) ===
    createThreeWave('#wave3-wrapper', '#wave3-height-container', {
        direction: 'horizontal',
        numLines: 55,
        numLinesMobile: 30, 
        scrollTrackSelector: '#scroll-track', 
        baseColor: '#E5E5E5',
        waveActiveColor: '#ff661a',
        waveInfluenceRatio: 0.08,
        activeWavePosition: 0.115 
    });

    // === Четвертая волна (Вертикальная, скролл-трек) ===
    const wave4Options = {
        direction: 'vertical', // По умолчанию - вертикально
        numLines: 65,
        numLinesMobile: 40, 
        scrollTrackSelector: '#scroll-track', 
        baseColor: '#D3D3D3',
        waveActiveColor: '#ff661a', 
        baseRatio: 0.1,
        waveRatio: 0.35,
        lineThickness: 1,
        waveInfluenceRatio: 0.06
    };

    // === ДОБАВЛЕННАЯ ЛОГИКА ДЛЯ МОБИЛЬНОЙ ВЕРСИИ ВОЛНЫ 4 ===
    if (IS_MOBILE) {
        wave4Options.direction = 'horizontal'; // Делаем горизонтальной
        // Используем настройки Третьей волны для корректной работы скролл-трека
        wave4Options.numLines = 55; // Как у wave3 (для десктопа, на мобилке возьмется numLinesMobile: 40)
        wave4Options.numLinesMobile = 40; // Уменьшим немного для отличия от wave3
        wave4Options.waveInfluenceRatio = 0.08; // Как у wave3
        wave4Options.activeWavePosition = 0.115; // Как у wave3
    }
    // ========================================================
    
    createThreeWave('#wave4-wrapper', '#wave4-height-container', wave4Options);
});


    // ========================================================================================================
    // === CLIENTS REVIEW CMS CUSTOM TABER ===
    // ========================================================================================================

document.addEventListener('DOMContentLoaded', () => {
  const clientItems = document.querySelectorAll('.client_item');
  const clientLogoColors = document.querySelectorAll('.client_logo_color');
  const clientLogos = document.querySelectorAll('.client_logo');
  const testimonialWrap = document.querySelector('.testimonial_wrap');

  // Целевые элементы для вставки контента
  const reviewText = document.querySelector('#review-text');
  const clientName = document.querySelector('#client-name');
  const clientPosition = document.querySelector('#client-position');
  const linkText = document.querySelector('#link-text');
  const linkIn = document.querySelector('#link-in');
  const outerLink = document.querySelector('#link');
  const avaImg = document.querySelector('#ava-img');

  if (clientItems.length === 0) {
    console.warn("Элементы с классом '.client_item' не найдены.");
    return;
  }

  // === Вспомогательные функции ===
  const updateElement = (target, value) => {
    if (!target) return false;
    if (value && value.trim() !== '') {
      target.style.display = '';
      target.textContent = value.trim();
      return true;
    } else {
      target.style.display = 'none';
      target.textContent = '';
      return false;
    }
  };

  const updateLink = (target, hrefValue) => {
    if (!target) return false;
    if (hrefValue && hrefValue.trim() !== '' && hrefValue.trim() !== '#') {
      target.style.display = '';
      target.setAttribute('href', hrefValue.trim());
      return true;
    } else {
      target.style.display = 'none';
      target.removeAttribute('href');
      return false;
    }
  };

  // === Основная логика ===
  clientItems.forEach(item => {
    item.addEventListener('mouseover', () => {
      clientItems.forEach(el => el.classList.remove('active'));
      clientLogoColors.forEach(logo => logo.classList.remove('active'));
      clientLogos.forEach(logo => logo.classList.remove('active'));

      item.classList.add('active');
      const logoColor = item.querySelector('.client_logo_color');
      const logo = item.querySelector('.client_logo');
      if (logoColor) logoColor.classList.add('active');
      if (logo) logo.classList.add('active');

      // fade-out перед обновлением
      if (testimonialWrap) testimonialWrap.classList.remove('is-visible');

      // берём данные
      const review = item.querySelector('[data-client="review"]')?.textContent || '';
      const name = item.querySelector('[data-client="name"]')?.textContent || '';
      const position = item.querySelector('[data-client="position"]')?.textContent || '';
      const linkTxt = item.querySelector('[data-client="link-text"]')?.textContent || '';
      const linkEl = item.querySelector('[data-client="link"]');
      const link = linkEl?.getAttribute('href') || '';
      const outerEl = item.querySelector('[data-client="outer-link"]');
      const outer = outerEl?.getAttribute('href') || '';
      const ava = item.querySelector('[data-client="ava"]');

      // обновляем с небольшой задержкой (чтобы плавно исчезло старое)
      setTimeout(() => {
        const visibleElements = [];

        visibleElements.push(updateElement(reviewText, review));
        visibleElements.push(updateElement(clientName, name));
        visibleElements.push(updateElement(clientPosition, position));
        visibleElements.push(updateElement(linkText, linkTxt));
        visibleElements.push(updateLink(linkIn, link));
        visibleElements.push(updateLink(outerLink, outer));

        // аватар
        if (avaImg) {
          let src = ava?.getAttribute('src') || ava?.textContent?.trim() || '';

          // --- фильтруем плейсхолдер Webflow ---
          if (src.includes('placeholder.60f9b1840c.svg')) {
            src = '';
          }

          if (src) {
            avaImg.style.display = '';
            avaImg.setAttribute('src', src);
            visibleElements.push(true);
          } else {
            avaImg.style.display = 'none';
            avaImg.removeAttribute('src');
          }
        }

        // если есть хотя бы одно заполненное поле → показываем обёртку
        if (testimonialWrap && visibleElements.some(v => v)) {
          requestAnimationFrame(() => testimonialWrap.classList.add('is-visible'));
        }
      }, 200); // ← длительность fade-out
    });
  });
});



    // ========================================================================================================
    // === CASES PREVIEW MAIN SCREEN === DESKTOP ===
    // ========================================================================================================

if (window.innerWidth > 1024) { // выполняется только на десктопе
  const caseCards = document.querySelectorAll('.case_preview_wrap');
  const navLinks = document.querySelectorAll('.nav_link');
  const logoGroup = document.querySelector('.logo-fill');
  const textBrands = document.querySelectorAll('.text_brand'); 

  let activeCard = null;

  function resetGlobalActive() {
    navLinks.forEach(el => el.classList.remove('active'));
    logoGroup.classList.remove('logo-white');
    textBrands.forEach(el => el.classList.remove('active')); 
  }

  // --------------------------
  // 🔹 Добавляем .active на .case_preview[data-start="true"]
  // --------------------------
  document.addEventListener('DOMContentLoaded', () => {
    const startPreview = document.querySelector('.case_preview[data-start="true"]');
    if (startPreview) {
      startPreview.classList.add('active');
    }
  });

  // --------------------------
  // 🔹 Hover логика
  // --------------------------
  caseCards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      // inactive всем, кроме вложенных в текущую карточку
      document.querySelectorAll('.opacity_box, .case_preview_img').forEach(el => {
        if (card.contains(el)) {
          el.classList.remove('inactive');
        } else {
          el.classList.add('inactive');
        }
      });

      // снимаем active с внутренних элементов других карточек
      document.querySelectorAll(
        '.case_preview_description_wrap.active, .case_blur_image.active, .case_preview.active'
      ).forEach(el => el.classList.remove('active'));

      // активируем элементы внутри карточки
      const description = card.querySelector('.case_preview_description_wrap');
      const blurImage = card.querySelector('.case_blur_image');
      const previewImage = card.querySelector('.case_preview');
      if (description) description.classList.add('active');
      if (blurImage) blurImage.classList.add('active');
      if (previewImage) previewImage.classList.add('active');

      if (card.hasAttribute('data-activate')) {
        navLinks.forEach(el => el.classList.add('active'));
        logoGroup.classList.add('logo-white');
        textBrands.forEach(el => el.classList.add('active')); 
        activeCard = card;
      } else {
        resetGlobalActive();
        activeCard = null;
      }
    });
  });

  // --------------------------
  // 🔹 IntersectionObserver
  // --------------------------
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting && entry.target === activeCard) {
        resetGlobalActive();
        activeCard = null;
      }
    });
  }, {threshold: 0});

  caseCards.forEach(card => observer.observe(card));
}

    // ========================================================================================================
    // === CASES PREVIEW CMS SLIDER MAIN SCREEN === MOBILE ===
    // ========================================================================================================

document.addEventListener('DOMContentLoaded', () => {
  if (window.Webflow) {
    window.Webflow.push(initSliderLogic);
  } else {
    // На случай, если Webflow не доступен — всё равно инициализируем
    initSliderLogic();
  }

  function initSliderLogic() {
    // Только для мобильных <= 1024px (как у тебя было)
    if (window.innerWidth > 1024) {
      console.log('Slider logic skipped: width > 1024');
      return;
    }

    // ==== Константы / селекторы ====
    const SLIDER_CLASS = '.slider_2';
    const SLIDE_WRAP_CLASS = '.slide_wrap';
    const CASE_PREVIEW_CLASS = '.case_preview';
    const CLEAR_DELAY_MS = 150;

    const navLinks = document.querySelectorAll('.nav_link');
    const logoGroup = document.querySelector('.logo-fill');
    const textBrands = document.querySelectorAll('.text_brand');

    const sliderElement = document.querySelector(SLIDER_CLASS);
    if (!sliderElement) {
      console.warn('Slider element not found:', SLIDER_CLASS);
      return;
    }

    const sliderMask = sliderElement.querySelector('.w-slider-mask');
    if (!sliderMask) {
      console.warn('Slider mask (.w-slider-mask) not found inside', SLIDER_CLASS);
      return;
    }

    const slideTimeouts = new Map();
    let transitionTimeoutId = null;

    // ==== Поиск внешнего элемента (универсально) ====
    function findExternalWrapper() {
      const candidates = [
        '#externalImage',
        '.external-image',
        '.externalImage',
        '[data-external-image]',
        '#external-image',
        '.externalImageWrapper',
        '.externalImage-wrapper'
      ];
      for (const s of candidates) {
        const el = document.querySelector(s);
        if (el) return el;
      }
      return null;
    }

    const externalWrapper = findExternalWrapper();
    if (!externalWrapper) {
      console.warn('External wrapper not found. Add e.g. <div class="external-image"><img></div> or id #externalImage');
    } else {
      // Если внутри wrapper есть img — используем его; иначе — будем использовать сам wrapper как bg-holder
      var externalImgEl = externalWrapper.tagName && externalWrapper.tagName.toLowerCase() === 'img'
        ? externalWrapper
        : externalWrapper.querySelector('img') || null;

      // Установим дефолтный transition для плавности
      if (!externalWrapper.style.transition) externalWrapper.style.transition = 'opacity 0.45s ease';
      if (externalImgEl && !externalImgEl.style.transition) externalImgEl.style.transition = 'opacity 0.45s ease';

      // Ensure starting opacity
      if (!externalWrapper.style.opacity) externalWrapper.style.opacity = 1;
      if (externalImgEl && !externalImgEl.style.opacity) externalImgEl.style.opacity = 1;
    }

    // ==== Утилиты для извлечения URL из .case_blur_image ====
    function findBlurElement(slide) {
      if (!slide) return null;
      // Ищем прямо элемент с data-image (это надежнее)
      let el = slide.querySelector('[data-image]');
      if (el) return el;
      // fallback по классу (учитываем возможные опечатки)
      el = slide.querySelector('.case_blur_image') || slide.querySelector('.case_blur_Image') || slide.querySelector('.case-blur-image');
      return el;
    }

    function extractUrlFromBlurEl(blurEl) {
      if (!blurEl) return null;
      // 1) атрибут src (если это <img>)
      const src = blurEl.getAttribute && blurEl.getAttribute('src');
      if (src) return src.trim();
      // 2) dataset.image
      if (blurEl.dataset && blurEl.dataset.image) return blurEl.dataset.image.trim();
      // 3) атрибут data-image raw
      const raw = blurEl.getAttribute && blurEl.getAttribute('data-image');
      if (raw) return raw.trim();
      // 4) <img> внутри
      const innerImg = blurEl.querySelector && blurEl.querySelector('img');
      if (innerImg) {
        const s2 = innerImg.getAttribute('src') || innerImg.currentSrc;
        if (s2) return s2.trim();
      }
      // 5) background-image CSS
      const bg = window.getComputedStyle(blurEl).backgroundImage;
      if (bg && bg !== 'none') {
        const m = bg.match(/url\(["']?(.+?)["']?\)/);
        if (m) return m[1];
      }
      return null;
    }

    // ==== Подстановка изображения в внешний элемент (плавно) ====
    function setExternalImage(newSrc) {
      if (!externalWrapper) return;
      if (!newSrc) {
        console.warn('setExternalImage: newSrc is empty');
        return;
      }

      // IMAGE element case
      if (externalImgEl) {
        // Если src совпадает — ничего не делаем
        if (externalImgEl.getAttribute('src') === newSrc) {
          // console.log('External image already set to', newSrc);
          return;
        }
        // Fade out wrapper (or img)
        externalWrapper.style.opacity = 0;

        // После короткой задержки меняем src и возвращаем opacity
        setTimeout(() => {
          externalImgEl.setAttribute('src', newSrc);
          // Если изображение уже закешировано, onload может не сработать — проверяем complete
          if (externalImgEl.complete) {
            externalWrapper.style.opacity = 1;
          } else {
            externalImgEl.onload = () => {
              externalWrapper.style.opacity = 1;
              externalImgEl.onload = null;
            };
          }
        }, 220);
      } else {
        // Background-image case: используем сам wrapper как фон
        const currentBg = window.getComputedStyle(externalWrapper).backgroundImage || '';
        const newBg = `url("${newSrc}")`;
        if (currentBg === newBg) return;
        externalWrapper.style.opacity = 0;
        setTimeout(() => {
          externalWrapper.style.backgroundImage = newBg;
          externalWrapper.style.opacity = 1;
        }, 220);
      }
    }

    // ==== Основная логика обновления классов и подстановки изображения ====
    function updateSliderClasses() {
      const slides = Array.from(sliderMask.querySelectorAll('.w-slide'));
      if (!slides.length) {
        console.warn('No .w-slide found inside slider mask');
        return;
      }

      // активный слайд по aria-hidden (как у Webflow)
      let activeIndex = slides.findIndex(slide => slide.getAttribute('aria-hidden') !== 'true');
      if (activeIndex === -1) activeIndex = 0;

      // Debug log
      // console.log('updateSliderClasses -> slides:', slides.length, 'activeIndex:', activeIndex);

      const numSlides = slides.length;
      const prevIndex = (activeIndex - 1 + numSlides) % numSlides;
      const nextIndex = (activeIndex + 1) % numSlides;

      // Сброс внутренних состояний (как у тебя было)
      document.querySelectorAll('.opacity_box, .case_preview_img').forEach(el => el.classList.remove('inactive'));
      document.querySelectorAll('.case_preview_description_wrap, .case_blur_image, .case_preview').forEach(el => el.classList.remove('active'));
      navLinks.forEach(el => el.classList.remove('active'));
      textBrands.forEach(el => el.classList.remove('active'));
      if (logoGroup) logoGroup.classList.remove('logo-white');

      slides.forEach((slide, i) => {
        const slideWrap = slide.querySelector(SLIDE_WRAP_CLASS);
        const casePreview = slide.querySelector(CASE_PREVIEW_CLASS);

        if (!slideWrap || !casePreview) {
          // Если структура отличается — пропускаем слайд
          // console.warn('Skipping slide', i, 'missing .slide_wrap or .case_preview');
          return;
        }

        const wrapKey = slideWrap;

        // Очистка left/right для не соседей через timeout
        if (i !== activeIndex && i !== prevIndex && i !== nextIndex) {
          if (slideWrap.classList.contains('left') || slideWrap.classList.contains('right')) {
            if (slideTimeouts.has(wrapKey)) clearTimeout(slideTimeouts.get(wrapKey));
            const timeoutId = setTimeout(() => {
              slideWrap.classList.remove('left', 'right');
              slideTimeouts.delete(wrapKey);
            }, CLEAR_DELAY_MS);
            slideTimeouts.set(wrapKey, timeoutId);
          }
        }

        // Логика для активного слайда
        if (i === activeIndex) {
          if (slideTimeouts.has(wrapKey)) {
            clearTimeout(slideTimeouts.get(wrapKey));
            slideTimeouts.delete(wrapKey);
            slideWrap.classList.remove('left', 'right');
          }

          casePreview.classList.add('active');

          slide.querySelectorAll('.opacity_box, .case_preview_img').forEach(el => el.classList.remove('inactive'));

          const description = slide.querySelector('.case_preview_description_wrap');
          const blurImage = slide.querySelector('.case_blur_image');
          if (description) description.classList.add('active');
          if (blurImage) blurImage.classList.add('active');

          const card = slide.querySelector('.case_preview_wrap');
          if (card && card.hasAttribute('data-activate')) {
            navLinks.forEach(el => el.classList.add('active'));
            if (logoGroup) logoGroup.classList.add('logo-white');
            textBrands.forEach(el => el.classList.add('active'));
          }

          // ---- вот здесь: берем URL из .case_blur_image и подставляем внешне ----
          const blurEl = findBlurElement(slide);
          const newSrc = extractUrlFromBlurEl(blurEl);
          // Debug:
          // console.log('Active slide', i, 'blurEl:', blurEl, 'newSrc:', newSrc);
          if (newSrc) {
            setExternalImage(newSrc);
          }
          // --------------------------------------------------------------------

        } else if (i === prevIndex) {
          slideWrap.classList.add('right');
          slideWrap.classList.remove('left');
        } else if (i === nextIndex) {
          slideWrap.classList.add('left');
          slideWrap.classList.remove('right');
        }

        // Для всех неактивных — ставим inactive
        if (i !== activeIndex) {
          slide.querySelectorAll('.opacity_box, .case_preview_img').forEach(el => el.classList.add('inactive'));
        }
      }); // slides.forEach
    } // updateSliderClasses

    // ==== Установка начального слайда (4-й / индекс 3) ====
    const navDots = sliderElement.querySelectorAll('.w-slider-dot');
    const targetDotIndex = 3;
    if (navDots.length > targetDotIndex) {
      const targetDot = navDots[targetDotIndex];
      if (!targetDot.classList.contains('w-active')) {
        setTimeout(() => targetDot.click(), 50);
      }
    }

    // первичный вызов
    setTimeout(updateSliderClasses, 150);

    // слушаем transitionend (Webflow как правило использует transform)
    sliderMask.addEventListener('transitionend', (e) => {
      if (e.propertyName !== 'transform') return;
      clearTimeout(transitionTimeoutId);
      transitionTimeoutId = setTimeout(updateSliderClasses, 50);
    });

    // MutationObserver: слежение за aria-hidden
    const observer = new MutationObserver((mutationsList) => {
      let ariaHiddenChanged = false;
      for (const m of mutationsList) {
        if (m.type === 'attributes' && m.attributeName === 'aria-hidden' && m.target.classList.contains('w-slide')) {
          ariaHiddenChanged = true;
          break;
        }
      }
      if (ariaHiddenChanged) {
        clearTimeout(transitionTimeoutId);
        transitionTimeoutId = setTimeout(updateSliderClasses, 50);
      }
    });
    observer.observe(sliderMask, { subtree: true, attributes: true, attributeFilter: ['aria-hidden'] });

    // resize handler
    window.addEventListener('resize', () => {
      if (window.innerWidth > 1024) return;
      clearTimeout(transitionTimeoutId);
      transitionTimeoutId = setTimeout(updateSliderClasses, 100);
    });
  } // initSliderLogic
});

    // ========================================================================================================
    // === CASES VERTICAL CMS === DESKTOP ===
    // ========================================================================================================


document.addEventListener('DOMContentLoaded', () => {
  const items = document.querySelectorAll('.services_case_mini');
  const bgImage = document.querySelector('.hwch_img_2');
  const overImage = document.querySelector('.hwch_img_3');
  const externalLink = document.querySelector('[data-link="case"]');
  const wrap = document.querySelector('.hwch_img_wrap'); // обертка для fade

  let activeItem = null;

  // === вспомогательные функции ===
  const updateImage = (imgTarget, sourceEl) => {
    if (!imgTarget) return false;
    if (sourceEl && sourceEl.src) {
      imgTarget.style.display = '';
      imgTarget.src = sourceEl.src;
      if (sourceEl.dataset.width) {
        imgTarget.style.width = sourceEl.dataset.width + '%';
      } else {
        imgTarget.style.removeProperty('width');
      }
      return true;
    } else {
      imgTarget.style.display = 'none';
      imgTarget.removeAttribute('src');
      return false;
    }
  };

  const updateLink = (target, linkEl) => {
    if (!target) return false;
    const href = linkEl?.getAttribute('href') || '';
    if (href && href.trim() !== '' && href.trim() !== '#') {
      target.style.display = '';
      target.setAttribute('href', href);
      return true;
    } else {
      target.style.display = 'none';
      target.removeAttribute('href');
      return false;
    }
  };

  // === основная логика ===
  function activateItem(item) {
    if (!item) return;

    // снимаем актив со всех
    items.forEach(el => el.classList.remove('is-active'));
    item.classList.add('is-active');
    activeItem = item;

    // данные из айтема
    const bg = item.querySelector('[data-image="bg"]');
    const over = item.querySelector('[data-image="over"]');
    const linkEl = item.querySelector('[data-link="preview"]');

    // fade-out
    if (wrap) wrap.classList.remove('is-visible');

    // обновляем контент после короткой задержки
    setTimeout(() => {
      const visible = [];

      visible.push(updateImage(bgImage, bg));
      visible.push(updateImage(overImage, over));
      visible.push(updateLink(externalLink, linkEl));

      // fade-in если есть контент
      if (wrap && visible.some(v => v)) {
        requestAnimationFrame(() => wrap.classList.add('is-visible'));
      }
    }, 200); // длительность fade-out (можно увеличить)
  }

  // слушатели
  items.forEach(item => {
    item.addEventListener('mouseenter', () => activateItem(item));
  });

  // активируем первый айтем при загрузке
  if (items.length > 0) {
    activateItem(items[0]);
  }
});




    // ========================================================================================================
    // === DOT FRAME COMPONENTS === CUSTOM PHOTO SIZE ===
    // ========================================================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Берём все блоки grid_dots_overlay (все четыре)
  const grids = document.querySelectorAll('.grid_dots_overlay');

  grids.forEach(grid => {
    // Для каждого grid ищем все .dot_photo_frame
    const frames = grid.querySelectorAll('.dot_photo_frame');

    frames.forEach(frame => {
      const imgWide = frame.querySelector('.img_120_160');
      const imgSquare = frame.querySelector('.dot_photo_120_120');
      const imgTall = frame.querySelector('.dot_photo_h_120');

      // Для ширины
      if (imgWide && imgWide.dataset.width) {
        imgWide.style.width = `${imgWide.dataset.width}vw`;
      }
      if (imgSquare && imgSquare.dataset.width) {
        imgSquare.style.width = `${imgSquare.dataset.width}vw`;
      }

      // Для высоты
      if (imgTall && imgTall.dataset.height) {
        imgTall.style.height = `${imgTall.dataset.height}vw`;
      }
    });
  });
});





