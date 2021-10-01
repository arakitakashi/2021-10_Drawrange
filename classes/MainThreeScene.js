import * as THREE from "three"
// import Vue from 'vue'
import Stats from 'three/examples/jsm/libs/stats.module'
// import { GUI } from 'three/examples/jsm/libs/dat.gui.module'

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

import config from '../plugins/config'
import RAF from '../plugins/RAF'

class MainThreeScene {
    constructor() {
        if (process.client) {
          const gui = require('three/examples/jsm/libs/dat.gui.module')
          this.GUI = gui.GUI
        }

        this.bind()
        this.maxParticleCount = 1000
        this.particleCount = 500
        this.r = 800
        this.rHalf = this.r / 2
        this.effectController = {
          showDots: true,
          showLines: true,
          minDistance: 150,
          limitConnections: false,
          maxConnections: 20,
          particleCount: 500
        }

        this.group = null
        this.particlesData = []
        this.positions = null
        this.colors = null
        this.particles = null
        this.pointCloud = null
        this.particlePositions = null
        this.linesMesh = null
    }

    init(container) {
        // RENDERER SETUP
        this.renderer = new THREE.WebGLRenderer({ antialias: true })
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.renderer.debug.checkShaderErrors = true
        this.renderer.outputEncoding = THREE.sRGBEncoding
        container.appendChild(this.renderer.domElement)

        // MAIN SCENE INSTANCE
        this.scene = new THREE.Scene()

        // CAMERA AND ORBIT CONTROLLER
        this.camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 4000)
        this.camera.position.z = 1750
        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.enabled = config.controls
        this.controls.maxDistance = 3000
        this.controls.minDistance = 1000

        const gui = new this.GUI()

        gui.add( this.effectController, 'showDots' ).onChange((value) => {
          this.pointCloud.visible = value
        })
        gui.add ( this.effectController, 'showLines' ).onChange((value) => {
          this.linesMesh.visible = value
        })
        gui.add ( this.effectController, 'minDistance', 10, 300)
        gui.add( this.effectController, 'limitConnections')
        gui.add( this.effectController, 'maxConnections', 0, 30, 1)
        gui.add( this.effectController, 'particleCount', 0, this.maxParticleCount, 1).onChange((value) => {
          this.particleCount = parseInt(value)
          this.particles.setDrawRange(0, this.particleCount)
        })


        // RENDER LOOP AND WINDOW SIZE UPDATER SETUP
        window.addEventListener("resize", this.resizeCanvas)
        RAF.subscribe('threeSceneUpdate', this.update)


        this.group = new THREE.Group()
        this.scene.add(this.group)

        const helper = new THREE.BoxHelper( new THREE.Mesh( new THREE.BoxGeometry( this.r, this.r, this.r)))
        helper.material.color.setHex( 0x101010 )
        helper.material.blending = THREE.AdditiveBlending
        helper.material.transparent = true
        this.group.add( helper )

        const segments = this.maxParticleCount * this.maxParticleCount

        this.positions = new Float32Array( segments * 3 )
        this.colors = new Float32Array( segments * 3 )

        const pMaterial = new THREE.PointsMaterial({
          color: 0xFFFFFF,
          size: 3,
          blending: THREE.AdditiveBlending,
          transparent: true,
          sizeAttenuation: false
        })

        this.particles = new THREE.BufferGeometry()
        this.particlePositions = new Float32Array( this.particleCount * 3)

        for(let i = 0; i < this.maxParticleCount; i++) {
          const x = Math.random()* this.r - this.r / 2
          const y = Math.random() * this.r - this.r / 2
          const z = Math.random() * this.r - this.r / 2

          this.particlePositions[i * 3] = x
          this.particlePositions[i * 3 + 1] = y
          this.particlePositions[i * 3 + 2] = z

          this.particlesData.push( {
            velocity: new THREE.Vector3( -1 + Math.random() * 2, -1 + Math.random() * 2, -1 + Math.random() * 2),
            numConnections: 0
          })

          this.particles.setDrawRange(0, this.particleCount)
          this.particles.setAttribute('position', new THREE.BufferAttribute( this.particlePositions, 3).setUsage(THREE.DynamicDrawUsage))

          // create the particle system
          this.pointCloud = new THREE.Points( this.particles, pMaterial)
          this.group.add(this.pointCloud)

          const geometry = new THREE.BufferGeometry()

          geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage( THREE.DynamicDrawUsage))
          geometry.setAttribute('color', new THREE.BufferAttribute( this.colors, 3).setUsage(THREE.DynamicDrawUsage))

          geometry.computeBoundingSphere()

          geometry.setDrawRange(0, 0)

          const material = new THREE.LineBasicMaterial({
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            transparent: true
          })

          this.linesMesh = new THREE.LineSegments( geometry, material)
          this.group.add( this.linesMesh )

          this.stats = new Stats()
          container.appendChild(this.stats.dom)
        }
    }

    animate() {
      let vertexpos = 0
      let colorpos = 0
      let numConnected = 0

      for(let i = 0; i < this.particleCount; i++) {
        this.particlesData[i].numConnections = 0
      }

      for (let i = 0; i < this.particleCount; i++) {
        const particleData = this.particlesData[i]

        this.particlePositions[i*3] += particleData.velocity.x
        this.particlePositions[i*3 + 1] += particleData.velocity.y
        this.particlePositions[i*3 + 2] += particleData.velocity.z

        if ( this.particlePositions[ i * 3 + 1] < - this.rHalf || this.particlePositions[ i * 3 + 1] > this.rHalf) {
          particleData.velocity.y = - particleData.velocity.y
        }
        if ( this.particlePositions[ i * 3 ] < - this.rHalf || this.particlePositions[ i * 3 ] > this.rHalf) {
          particleData.velocity.x = - particleData.velocity.x
        }
        if ( this.particlePositions[ i * 3 + 2] < - this.rHalf || this.particlePositions[ i * 3 + 2] > this.rHalf) {
          particleData.velocity.z = - particleData.velocity.z
        }

        if( this.effectController.limitConnections && particleData.numConnections >= this.effectController.maxConnections){
          continue
        }

        // Check collision
        for (let j = i + 1; j < this.particleCount; j ++) {
          const particleDataB = this.particlesData[j]
          if ( this.effectController.limitConnections && particleDataB.numConnections >= this.effectController.maxConnections )
            continue;

          const dx = this.particlePositions[ i * 3 ] - this.particlePositions[ j * 3 ];
          const dy = this.particlePositions[ i * 3 + 1 ] - this.particlePositions[ j * 3 + 1 ];
          const dz = this.particlePositions[ i * 3 + 2 ] - this.particlePositions[ j * 3 + 2 ];
          const dist = Math.sqrt( dx * dx + dy * dy + dz * dz );

          if ( dist < this.effectController.minDistance ) {

            particleData.numConnections ++;
            particleDataB.numConnections ++;

            const alpha = 1.0 - dist / this.effectController.minDistance;

            this.positions[ vertexpos ++ ] = this.particlePositions[ i * 3 ];
            this.positions[ vertexpos ++ ] = this.particlePositions[ i * 3 + 1 ];
            this.positions[ vertexpos ++ ] = this.particlePositions[ i * 3 + 2 ];

            this.positions[ vertexpos ++ ] = this.particlePositions[ j * 3 ];
            this.positions[ vertexpos ++ ] = this.particlePositions[ j * 3 + 1 ];
            this.positions[ vertexpos ++ ] = this.particlePositions[ j * 3 + 2 ];

            this.colors[ colorpos ++ ] = alpha;
            this.colors[ colorpos ++ ] = alpha;
            this.colors[ colorpos ++ ] = alpha;

            this.colors[ colorpos ++ ] = alpha;
            this.colors[ colorpos ++ ] = alpha;
            this.colors[ colorpos ++ ] = alpha;

            numConnected++
        }
      }
    }

    this.linesMesh.geometry.setDrawRange( 0, numConnected * 2)
    this.linesMesh.geometry.attributes.position.needsUpdate = true
    this.linesMesh.geometry.attributes.color.needsUpdate = true

    this.pointCloud.geometry.attributes.position.needsUpdate = true
  }

    update() {
        this.renderer.render(this.scene, this.camera)
        this.animate()
        this.stats.update()
    }

    resizeCanvas() {
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.camera.aspect = window.innerWidth / window.innerHeight
        this.camera.updateProjectionMatrix()
    }

    bind() {
        this.resizeCanvas = this.resizeCanvas.bind(this)
        this.update = this.update.bind(this)
        this.init = this.init.bind(this)
    }
}

const _instance = new MainThreeScene()
export default _instance