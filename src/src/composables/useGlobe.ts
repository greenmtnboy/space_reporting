import { ref, onUnmounted, type Ref } from 'vue'
import * as THREE from 'three'
import { useContinentOutlines } from './useContinentOutlines'

const EARTH_RADIUS = 1 // Normalized radius for the globe
const GLOBE_COLOR = 0x005b96 // Slightly brighter base color for the globe
const GLOBE_EMISSIVE = 0x050510 // Reduced emissive for better day/night contrast

export interface GlobeState {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer | null
  globe: THREE.Mesh | null
  orbitGroup: THREE.Group // Group to hold all orbit lines
}

export function useGlobe(containerRef: Ref<HTMLElement | null>) {
  const isInitialized = ref(false)

  const state: GlobeState = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(45, 1, 0.1, 1000),
    renderer: null,
    globe: null,
    orbitGroup: new THREE.Group()
  }

  // Animation frame ID for cleanup
  let animationFrameId: number | null = null
  let resizeObserver: ResizeObserver | null = null

  // Continent outlines
  const continentOutlines = useContinentOutlines({ earthRadius: EARTH_RADIUS })

  // Globe rotation speed (radians per frame at 60fps)
  const autoRotationSpeed = 0.001

  // Interactive controls state
  let isDragging = false
  let previousMousePosition = { x: 0, y: 0 }
  let userRotationVelocity = { x: 0, y: 0 }
  const dragSensitivity = 0.005
  const zoomSensitivity = 0.001
  const minZoom = 2
  const maxZoom = 100
  const friction = 0.95 // Momentum decay

  function init() {
    if (!containerRef.value || isInitialized.value) return

    const container = containerRef.value
    const width = container.clientWidth
    const height = container.clientHeight

    // Setup renderer
    state.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    })
    state.renderer.setSize(width, height)
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    state.renderer.setClearColor(0x030305, 1)
    container.appendChild(state.renderer.domElement)

    // Setup camera
    state.camera.aspect = width / height
    state.camera.position.z = 25
    state.camera.updateProjectionMatrix()

    // Create globe
    const geometry = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64)
    const material = new THREE.MeshPhongMaterial({
      color: GLOBE_COLOR,
      emissive: GLOBE_EMISSIVE,
      shininess: 5,
      transparent: false
    })
    state.globe = new THREE.Mesh(geometry, material)
    state.scene.add(state.globe)

    // Add continent outlines as child of globe so they rotate together
    const outlineGroup = continentOutlines.buildOutlines()
    state.globe.add(outlineGroup)

    // Add orbit group to scene
    state.scene.add(state.orbitGroup)

    // Add ambient light (reduced for better day/night contrast)
    const ambientLight = new THREE.AmbientLight(0x404050, 0.25)
    state.scene.add(ambientLight)

    // Add directional light (sun-like) - brighter for clear illumination
    const directionalLight = new THREE.DirectionalLight(0xffffff, 6)
    directionalLight.position.set(5, 2, 4)
    state.scene.add(directionalLight)

    // Add subtle rim light for depth on the dark side
    const rimLight = new THREE.DirectionalLight(0x4488ff, 0.15)
    rimLight.position.set(-5, 0, -5)
    state.scene.add(rimLight)

    // Setup resize observer
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          handleResize(width, height)
        }
      }
    })
    resizeObserver.observe(container)

    // Setup mouse controls for dragging
    const canvas = state.renderer.domElement
    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('mouseleave', onMouseUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    // Touch support
    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)

    isInitialized.value = true

    // Start render loop
    animate()
  }

  function onMouseDown(event: MouseEvent) {
    isDragging = true
    previousMousePosition = { x: event.clientX, y: event.clientY }
    userRotationVelocity = { x: 0, y: 0 }
  }

  function onMouseMove(event: MouseEvent) {
    if (!isDragging) return

    const deltaX = event.clientX - previousMousePosition.x
    const deltaY = event.clientY - previousMousePosition.y

    // Update velocity for momentum
    userRotationVelocity.x = deltaX * dragSensitivity
    userRotationVelocity.y = deltaY * dragSensitivity

    // Apply rotation
    if (state.globe) {
      state.globe.rotation.y += userRotationVelocity.x
      state.globe.rotation.x += userRotationVelocity.y
      // Clamp vertical rotation to prevent flipping
      state.globe.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.globe.rotation.x))
    }
    if (state.orbitGroup) {
      state.orbitGroup.rotation.y += userRotationVelocity.x
      state.orbitGroup.rotation.x += userRotationVelocity.y
      state.orbitGroup.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.orbitGroup.rotation.x))
    }

    previousMousePosition = { x: event.clientX, y: event.clientY }
  }

  function onMouseUp() {
    isDragging = false
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault()
    const zoomDelta = event.deltaY * zoomSensitivity
    state.camera.position.z = Math.max(minZoom, Math.min(maxZoom, state.camera.position.z + zoomDelta))
  }

  // Touch support handlers
  let lastTouchDistance = 0

  function onTouchStart(event: TouchEvent) {
    event.preventDefault()
    if (event.touches.length === 1) {
      isDragging = true
      previousMousePosition = { x: event.touches[0].clientX, y: event.touches[0].clientY }
      userRotationVelocity = { x: 0, y: 0 }
    } else if (event.touches.length === 2) {
      // Pinch zoom
      lastTouchDistance = getTouchDistance(event.touches)
    }
  }

  function onTouchMove(event: TouchEvent) {
    event.preventDefault()
    if (event.touches.length === 1 && isDragging) {
      const deltaX = event.touches[0].clientX - previousMousePosition.x
      const deltaY = event.touches[0].clientY - previousMousePosition.y

      userRotationVelocity.x = deltaX * dragSensitivity
      userRotationVelocity.y = deltaY * dragSensitivity

      if (state.globe) {
        state.globe.rotation.y += userRotationVelocity.x
        state.globe.rotation.x += userRotationVelocity.y
        state.globe.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.globe.rotation.x))
      }
      if (state.orbitGroup) {
        state.orbitGroup.rotation.y += userRotationVelocity.x
        state.orbitGroup.rotation.x += userRotationVelocity.y
        state.orbitGroup.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.orbitGroup.rotation.x))
      }

      previousMousePosition = { x: event.touches[0].clientX, y: event.touches[0].clientY }
    } else if (event.touches.length === 2) {
      // Pinch zoom
      const currentDistance = getTouchDistance(event.touches)
      const zoomDelta = (lastTouchDistance - currentDistance) * 0.01
      state.camera.position.z = Math.max(minZoom, Math.min(maxZoom, state.camera.position.z + zoomDelta))
      lastTouchDistance = currentDistance
    }
  }

  function onTouchEnd() {
    isDragging = false
  }

  function getTouchDistance(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  function handleResize(width: number, height: number) {
    if (!state.renderer) return

    state.camera.aspect = width / height
    state.camera.updateProjectionMatrix()
    state.renderer.setSize(width, height)
  }

  function animate() {
    animationFrameId = requestAnimationFrame(animate)

    if (!isDragging) {
      // Apply momentum when not dragging
      if (Math.abs(userRotationVelocity.x) > 0.0001 || Math.abs(userRotationVelocity.y) > 0.0001) {
        if (state.globe) {
          state.globe.rotation.y += userRotationVelocity.x
          state.globe.rotation.x += userRotationVelocity.y
          state.globe.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.globe.rotation.x))
        }
        if (state.orbitGroup) {
          state.orbitGroup.rotation.y += userRotationVelocity.x
          state.orbitGroup.rotation.x += userRotationVelocity.y
          state.orbitGroup.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.orbitGroup.rotation.x))
        }
        // Apply friction
        userRotationVelocity.x *= friction
        userRotationVelocity.y *= friction
      } else {
        // Auto-rotate when idle (no user interaction)
        if (state.globe) {
          state.globe.rotation.y += autoRotationSpeed
        }
        if (state.orbitGroup) {
          state.orbitGroup.rotation.y += autoRotationSpeed
        }
      }
    }

    if (state.renderer) {
      state.renderer.render(state.scene, state.camera)
    }
  }

  function cleanup() {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
    }

    if (resizeObserver) {
      resizeObserver.disconnect()
    }

    // Remove event listeners
    if (state.renderer) {
      const canvas = state.renderer.domElement
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('mouseleave', onMouseUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)

      state.renderer.dispose()
      state.renderer.domElement.remove()
    }

    // Dispose continent outlines
    continentOutlines.dispose()

    // Dispose geometries and materials
    state.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose())
        } else {
          object.material.dispose()
        }
      }
      if (object instanceof THREE.Line) {
        object.geometry.dispose()
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose())
        } else {
          object.material.dispose()
        }
      }
    })

    isInitialized.value = false
  }

  // Convert lat/lng to 3D position on globe surface
  function latLngToVector3(lat: number, lng: number, altitude: number = 0): THREE.Vector3 {
    const phi = (90 - lat) * (Math.PI / 180)
    const theta = (lng + 180) * (Math.PI / 180)
    const radius = EARTH_RADIUS + altitude

    const x = -radius * Math.sin(phi) * Math.cos(theta)
    const y = radius * Math.cos(phi)
    const z = radius * Math.sin(phi) * Math.sin(theta)

    return new THREE.Vector3(x, y, z)
  }

  // Get the orbit group for adding/removing orbit lines
  function getOrbitGroup(): THREE.Group {
    return state.orbitGroup
  }

  // Get scene for advanced operations
  function getScene(): THREE.Scene {
    return state.scene
  }

  onUnmounted(() => {
    cleanup()
  })

  // Get camera for external use (raycasting, etc.)
  function getCamera(): THREE.PerspectiveCamera {
    return state.camera
  }

  // Get renderer for external use
  function getRenderer(): THREE.WebGLRenderer | null {
    return state.renderer
  }

  return {
    init,
    cleanup,
    isInitialized,
    latLngToVector3,
    getOrbitGroup,
    getScene,
    getCamera,
    getRenderer,
    EARTH_RADIUS
  }
}
