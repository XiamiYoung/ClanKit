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
      <button @click="toggleWireframe" title="Toggle wireframe" class="babylon-tool-btn">
        <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/>
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

let engine = null
let scene = null
let camera = null
let initialCameraState = null
let wireframeOn = false

async function initScene() {
  if (!canvasEl.value) return

  loading.value = true
  error.value = null

  try {
    const BABYLON = await import('@babylonjs/core')
    await import('@babylonjs/loaders')

    engine = new BABYLON.Engine(canvasEl.value, true, {
      preserveDrawingBuffer: true,
      stencil: true
    })

    scene = new BABYLON.Scene(engine)
    scene.clearColor = new BABYLON.Color4(0.96, 0.96, 0.96, 1)

    // Camera
    camera = new BABYLON.ArcRotateCamera(
      'cam', Math.PI / 4, Math.PI / 3, 10,
      BABYLON.Vector3.Zero(), scene
    )
    camera.attachControl(canvasEl.value, true)
    camera.wheelPrecision = 30
    camera.minZ = 0.01
    camera.lowerRadiusLimit = 0.5
    camera.panningSensibility = 80

    // Lights
    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene)
    hemi.intensity = 0.8
    const dir = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-1, -2, 1), scene)
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

    const result = await BABYLON.SceneLoader.ImportMeshAsync('', rootUrl, fileName, scene)

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
      camera.target = center
      camera.radius = size * 1.5
      camera.alpha = Math.PI / 4
      camera.beta = Math.PI / 3
    }

    // Save initial camera state
    initialCameraState = {
      alpha: camera.alpha,
      beta: camera.beta,
      radius: camera.radius,
      target: camera.target.clone()
    }

    engine.runRenderLoop(() => scene.render())

    loading.value = false
  } catch (e) {
    console.error('BabylonViewer load error:', e)
    error.value = 'Failed to load 3D model'
    loading.value = false
  }
}

function resetCamera() {
  if (!camera || !initialCameraState) return
  camera.alpha = initialCameraState.alpha
  camera.beta = initialCameraState.beta
  camera.radius = initialCameraState.radius
  camera.target = initialCameraState.target.clone()
}

function toggleWireframe() {
  if (!scene) return
  wireframeOn = !wireframeOn
  for (const mesh of scene.meshes) {
    if (mesh.material) {
      mesh.material.wireframe = wireframeOn
    }
  }
}

function handleResize() {
  engine?.resize()
}

onMounted(() => {
  initScene()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  engine?.stopRenderLoop()
  scene?.dispose()
  engine?.dispose()
  engine = null
  scene = null
  camera = null
})

watch(() => props.src, () => {
  if (scene) {
    scene.dispose()
    engine?.stopRenderLoop()
  }
  initScene()
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
