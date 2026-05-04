<template>
  <div class="babylon-viewer" ref="containerEl">
    <canvas ref="canvasEl" class="babylon-canvas" />
    <div v-if="loading" class="babylon-loading">
      <div class="babylon-spinner"></div>
      <span>Loading 3D model</span>
    </div>
    <div v-if="error" class="babylon-error">
      <svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      <span>{{ error }}</span>
    </div>
    <div class="babylon-toolbar">
      <button @click="resetCamera" title="Reset view" class="babylon-tool-btn">
        <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps({
  src: { type: String, required: true }
})

const containerEl = ref(null)
const canvasEl = ref(null)
const loading = ref(true)
const error = ref(null)

let activeInstance = null
let initVersion = 0

function createInstance() {
  return {
    engine: null,
    scene: null,
    camera: null,
    initialCameraState: null,
    loadPromise: null,
    disposePromise: null,
    disposed: false,
    disposeRequested: false
  }
}

function disposeInstance(instance) {
  if (!instance || instance.disposed) return

  instance.disposed = true

  try {
    instance.camera?.detachControl(canvasEl.value)
  } catch {}

  try {
    instance.engine?.stopRenderLoop()
  } catch {}

  try {
    instance.scene?.dispose()
  } catch {}

  try {
    instance.engine?.dispose()
  } catch {}

  instance.engine = null
  instance.scene = null
  instance.camera = null
  instance.initialCameraState = null
}

function scheduleDispose(instance) {
  if (!instance) return Promise.resolve()
  if (instance.disposePromise) return instance.disposePromise

  instance.disposeRequested = true

  const finalize = () => {
    disposeInstance(instance)
    if (activeInstance === instance) activeInstance = null
  }

  instance.disposePromise = Promise.resolve(instance.loadPromise)
    .catch(() => {})
    .then(finalize)

  return instance.disposePromise
}

async function initScene() {
  if (!canvasEl.value || !props.src) return

  const version = ++initVersion
  let instance = null

  loading.value = true
  error.value = null

  try {
    const BABYLON = await import('@babylonjs/core')
    await import('@babylonjs/loaders')

    if (version !== initVersion || !canvasEl.value) return

    instance = createInstance()
    activeInstance = instance

    instance.engine = new BABYLON.Engine(canvasEl.value, true, {
      preserveDrawingBuffer: true,
      stencil: true
    })

    instance.scene = new BABYLON.Scene(instance.engine)
    instance.scene.clearColor = new BABYLON.Color4(0.96, 0.96, 0.96, 1)

    // Camera
    instance.camera = new BABYLON.ArcRotateCamera(
      'cam', Math.PI / 4, Math.PI / 3, 10,
      BABYLON.Vector3.Zero(), instance.scene
    )
    instance.camera.attachControl(canvasEl.value, true)
    instance.camera.wheelPrecision = 30
    instance.camera.minZ = 0.01
    instance.camera.lowerRadiusLimit = 0.5
    instance.camera.panningSensibility = 80

    // Lights
    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), instance.scene)
    hemi.intensity = 0.8
    const dir = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-1, -2, 1), instance.scene)
    dir.intensity = 0.6

    // Load model
    const url = props.src
    let rootUrl, fileName
    const lastSlash = url.lastIndexOf('/')
    if (lastSlash >= 0) {
      rootUrl = url.substring(0, lastSlash + 1)
      fileName = url.substring(lastSlash + 1)
    } else {
      rootUrl = ''
      fileName = url
    }

    instance.loadPromise = BABYLON.SceneLoader.ImportMeshAsync('', rootUrl, fileName, instance.scene)
    const result = await instance.loadPromise

    if (instance.disposed || version !== initVersion || activeInstance !== instance) {
      if (activeInstance !== instance) {
        disposeInstance(instance)
      }
      return
    }

    // Frame the loaded model
    if (result.meshes.length > 0) {
      let min = new BABYLON.Vector3(Infinity, Infinity, Infinity)
      let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity)
      for (const mesh of result.meshes) {
        mesh.computeWorldMatrix(true)
        const bounds = mesh.getBoundingInfo()
        if (!bounds) continue
        const bmin = bounds.boundingBox.minimumWorld
        const bmax = bounds.boundingBox.maximumWorld
        min = BABYLON.Vector3.Minimize(min, bmin)
        max = BABYLON.Vector3.Maximize(max, bmax)
      }
      const center = BABYLON.Vector3.Center(min, max)
      const size = max.subtract(min).length()
      instance.camera.target = center
      instance.camera.radius = size * 1.5
      instance.camera.alpha = Math.PI / 4
      instance.camera.beta = Math.PI / 3
    }

    // Save initial camera state
    instance.initialCameraState = {
      alpha: instance.camera.alpha,
      beta: instance.camera.beta,
      radius: instance.camera.radius,
      target: instance.camera.target.clone()
    }

    instance.engine.runRenderLoop(() => {
      if (!instance.disposed && !instance.scene?.isDisposed) {
        instance.scene.render()
      }
    })

    loading.value = false
  } catch (e) {
    if (version !== initVersion) return
    if (instance) {
      disposeInstance(instance)
      if (activeInstance === instance) activeInstance = null
    }
    console.error('BabylonViewer load error:', e)
    error.value = 'Failed to load 3D model'
    loading.value = false
  } finally {
    if (instance?.disposeRequested) {
      void scheduleDispose(instance)
    }
  }
}

function resetCamera() {
  const instance = activeInstance
  if (!instance?.camera || !instance.initialCameraState) return
  instance.camera.alpha = instance.initialCameraState.alpha
  instance.camera.beta = instance.initialCameraState.beta
  instance.camera.radius = instance.initialCameraState.radius
  instance.camera.target = instance.initialCameraState.target.clone()
}

function handleResize() {
  activeInstance?.engine?.resize()
}

onMounted(() => {
  void initScene()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  initVersion += 1
  window.removeEventListener('resize', handleResize)
  void scheduleDispose(activeInstance)
  activeInstance = null
})

watch(() => props.src, async (newSrc, oldSrc) => {
  if (!newSrc || newSrc === oldSrc) return

  initVersion += 1
  const previousInstance = activeInstance
  activeInstance = null
  await scheduleDispose(previousInstance)
  await initScene()
})
</script>

<style scoped>
.babylon-viewer {
  position: relative;
  width: 100%;
  height: 300px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #E5E5EA;
  margin: 0.5rem 0;
  background: #F5F5F5;
}
.babylon-canvas {
  width: 100%;
  height: 100%;
  outline: none;
}
.babylon-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(245,245,245,0.9);
  font-family: 'Inter', sans-serif;
  font-size: 0.8rem;
  color: #6B7280;
}
.babylon-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #E5E5EA;
  border-top-color: #1A1A1A;
  border-radius: 50%;
  animation: bab-spin 0.7s linear infinite;
}
@keyframes bab-spin {
  to { transform: rotate(360deg); }
}
.babylon-error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(245,245,245,0.95);
  font-family: 'Inter', sans-serif;
  font-size: 0.8rem;
  color: #EF4444;
}
.babylon-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}
.babylon-viewer:hover .babylon-toolbar {
  opacity: 1;
}
.babylon-tool-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: #1A1A1A;
  color: #fff;
  border: none;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
  transition: background 0.15s;
}
.babylon-tool-btn:hover {
  background: #374151;
}
</style>
