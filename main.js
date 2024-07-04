import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

import {FBXLoader} from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js';
import {GLTFLoader} from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/GLTFLoader.js';
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/controls/OrbitControls.js';
import {RectAreaLightHelper} from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/helpers/RectAreaLightHelper.js';


class BasicCharacterControllerProxy {
  constructor(animations) {
    this._animations = animations;
  }

  get animations() {
    return this._animations;
  }
};


class BasicCharacterController {
  constructor(params) {
    this._Init(params);
  }

  _Init(params) {
    this._params = params;
    this._decceleration = new THREE.Vector3(-0.0005, -0.0001, -5.0);
    this._acceleration = new THREE.Vector3(0.03, 0.3, 5);
    this._velocity = new THREE.Vector3(0, 0, 0);

    this._animations = {};
    this._input = new BasicCharacterControllerInput();
    this._stateMachine = new CharacterFSM(
        new BasicCharacterControllerProxy(this._animations));

    this._LoadModels();
  }

  _LoadModels() {
    const loader = new FBXLoader();
    loader.setPath('./resources/');
    loader.load('Idle.fbx', (fbx) => {
      fbx.scale.setScalar(0.005);
      fbx.traverse(c => {
        c.castShadow = true;
        c.receiveShadow = true;
      });

      fbx.position.set(0, 0, 0); 
      this._target = fbx;
      this._params.scene.add(this._target);

      this._mixer = new THREE.AnimationMixer(this._target);

      this._manager = new THREE.LoadingManager();
      this._manager.onLoad = () => {
        this._stateMachine.SetState('idle');
      };

      const _OnLoad = (animName, anim) => {
        const clip = anim.animations[0];
        const action = this._mixer.clipAction(clip);
  
        this._animations[animName] = {
          clip: clip,
          action: action,
        };
      };

      const loader = new FBXLoader(this._manager);
      loader.setPath('./resources/');
      loader.load('Walking.fbx', (a) => { _OnLoad('walk', a); });
      loader.load('Run.fbx', (a) => { _OnLoad('run', a); });
      loader.load('idle1.fbx', (a) => { _OnLoad('idle', a); });
      loader.load('Boxing.fbx', (a) => { _OnLoad('dance', a); });
    });
  }

  Update(timeInSeconds) {
    if (!this._target) {
      return;
    }

    this._stateMachine.Update(timeInSeconds, this._input);

    const velocity = this._velocity;
    const frameDecceleration = new THREE.Vector3(
        velocity.x * this._decceleration.x,
        velocity.y * this._decceleration.y,
        velocity.z * this._decceleration.z
    );
    frameDecceleration.multiplyScalar(timeInSeconds);
    frameDecceleration.z = Math.sign(frameDecceleration.z) * Math.min(
        Math.abs(frameDecceleration.z), Math.abs(velocity.z));

    velocity.add(frameDecceleration);

    const controlObject = this._target;
    const _Q = new THREE.Quaternion();
    const _A = new THREE.Vector3();
    const _R = controlObject.quaternion.clone();

    const acc = this._acceleration.clone();
    if (this._input._keys.shift) {
      acc.multiplyScalar(2.0);
    }

    if (this._stateMachine._currentState.Name == 'dance') {
      acc.multiplyScalar(0.0);
    }

    if (this._input._keys.forward) {
      velocity.z += acc.z * timeInSeconds;
    }
    if (this._input._keys.backward) {
      velocity.z -= acc.z * timeInSeconds;
    }
    if (this._input._keys.left) {
      _A.set(0, 1, 0);
      _Q.setFromAxisAngle(_A, 4.0 * Math.PI * timeInSeconds * this._acceleration.y);
      _R.multiply(_Q);
    }
    if (this._input._keys.right) {
      _A.set(0, 1, 0);
      _Q.setFromAxisAngle(_A, 4.0 * -Math.PI * timeInSeconds * this._acceleration.y);
      _R.multiply(_Q);
    }

    controlObject.quaternion.copy(_R);

    const oldPosition = new THREE.Vector3();
    oldPosition.copy(controlObject.position);

    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyQuaternion(controlObject.quaternion);
    forward.normalize();

    const sideways = new THREE.Vector3(1, 0, 0);
    sideways.applyQuaternion(controlObject.quaternion);
    sideways.normalize();

    sideways.multiplyScalar(velocity.x * timeInSeconds);
    forward.multiplyScalar(velocity.z * timeInSeconds);

    controlObject.position.add(forward);
    controlObject.position.add(sideways);

    oldPosition.copy(controlObject.position);

    if (this._mixer) {
      this._mixer.update(timeInSeconds);
    }
  }
};

class BasicCharacterControllerInput {
  constructor() {
    this._Init();    
  }

  _Init() {
    this._keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      space: false,
      shift: false,
    };
    document.addEventListener('keydown', (e) => this._onKeyDown(e), false);
    document.addEventListener('keyup', (e) => this._onKeyUp(e), false);
  }

  _onKeyDown(event) {
    switch (event.keyCode) {
      case 87: // w
        this._keys.forward = true;
        break;
      case 65: // a
        this._keys.left = true;
        break;
      case 83: // s
        this._keys.backward = true;
        break;
      case 68: // d
        this._keys.right = true;
        break;
      case 32: // SPACE
        this._keys.space = true;
        break;
      case 16: // SHIFT
        this._keys.shift = true;
        break;
    }
  }

  _onKeyUp(event) {
    switch(event.keyCode) {
      case 87: // w
        this._keys.forward = false;
        break;
      case 65: // a
        this._keys.left = false;
        break;
      case 83: // s
        this._keys.backward = false;
        break;
      case 68: // d
        this._keys.right = false;
        break;
      case 32: // SPACE
        this._keys.space = false;
        break;
      case 16: // SHIFT
        this._keys.shift = false;
        break;
    }
  }
};

class FreeRoamCameraController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.movementSpeed = 10.0;
    this.lookSpeed = 0.005;

    this._keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false,
    };

    this._Init();
  }

  _Init() {
    this.domElement.addEventListener('keydown', (e) => this._onKeyDown(e), false);
    this.domElement.addEventListener('keyup', (e) => this._onKeyUp(e), false);
    this.domElement.addEventListener('mousemove', (e) => this._onMouseMove(e), false);

    this.pitch = 0;
    this.yaw = 0;
    this.lastMousePosition = { x: 0, y: 0 };
  }

  _onKeyDown(event) {
    switch (event.keyCode) {
      case 87: // w
        this._keys.forward = true;
        break;
      case 83: // s
        this._keys.backward = true;
        break;
      case 68: // a
        this._keys.left = true;
        break;
      case 65: // d
        this._keys.right = true;
        break;
      case 81: // q
        this._keys.up = true;
        break;
      case 69: // e
        this._keys.down = true;
        break;
    }
  }

  _onKeyUp(event) {
    switch (event.keyCode) {
      case 87: // w
        this._keys.forward = false;
        break;
      case 83: // s
        this._keys.backward = false;
        break;
      case 68: // a
        this._keys.left = false;
        break;
      case 65: // d
        this._keys.right = false;
        break;
      case 81: // q
        this._keys.up = false;
        break;
      case 69: // e
        this._keys.down = false;
        break;
    }
  }

  _onMouseMove(event) {
    const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

    this.yaw -= movementX * this.lookSpeed;
    this.pitch -= movementY * this.lookSpeed;

    this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
  }

  Update(delta) {
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);

    const right = new THREE.Vector3();
    right.crossVectors(this.camera.up, direction).normalize();

    const up = this.camera.up.clone();

    const forwardVelocity = direction.multiplyScalar((this._keys.forward ? 1 : 0) - (this._keys.backward ? 1 : 0));
    const rightVelocity = right.multiplyScalar((this._keys.left ? -1 : 0) - (this._keys.right ? -1 : 0));
    const upVelocity = up.multiplyScalar((this._keys.up ? 1 : 0) - (this._keys.down ? 1 : 0));

    const velocity = new THREE.Vector3();
    velocity.add(forwardVelocity);
    velocity.add(rightVelocity);
    velocity.add(upVelocity);
    velocity.normalize().multiplyScalar(this.movementSpeed * delta);

    this.camera.position.add(velocity);

    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.camera.quaternion.copy(quaternion);
  }
}


class FiniteStateMachine {
  constructor() {
    this._states = {};
    this._currentState = null;
  }

  _AddState(name, type) {
    this._states[name] = type;
  }

  SetState(name) {
    const prevState = this._currentState;
    
    if (prevState) {
      if (prevState.Name == name) {
        return;
      }
      prevState.Exit();
    }

    const state = new this._states[name](this);

    this._currentState = state;
    state.Enter(prevState);
  }

  Update(timeElapsed, input) {
    if (this._currentState) {
      this._currentState.Update(timeElapsed, input);
    }
  }
};


class CharacterFSM extends FiniteStateMachine {
  constructor(proxy) {
    super();
    this._proxy = proxy;
    this._Init();
  }

  _Init() {
    this._AddState('idle', IdleState);
    this._AddState('walk', WalkState);
    this._AddState('run', RunState);
    this._AddState('dance', DanceState);
  }
};


class State {
  constructor(parent) {
    this._parent = parent;
  }

  Enter() {}
  Exit() {}
  Update() {}
};


class DanceState extends State {
  constructor(parent) {
    super(parent);

    this._FinishedCallback = () => {
      this._Finished();
    }
  }

  get Name() {
    return 'dance';
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations['dance'].action;
    const mixer = curAction.getMixer();
    mixer.addEventListener('finished', this._FinishedCallback);

    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.reset();  
      curAction.setLoop(THREE.LoopOnce, 1);
      curAction.clampWhenFinished = true;
      curAction.crossFadeFrom(prevAction, 0.2, true);
      curAction.play();
    } else {
      curAction.play();
    }
  }

  _Finished() {
    this._Cleanup();
    this._parent.SetState('idle');
  }

  _Cleanup() {
    const action = this._parent._proxy._animations['dance'].action;
    
    action.getMixer().removeEventListener('finished', this._CleanupCallback);
  }

  Exit() {
    this._Cleanup();
  }

  Update(_) {
  }
};


class WalkState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return 'walk';
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations['walk'].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.enabled = true;

      if (prevState.Name == 'run') {
        const ratio = curAction.getClip().duration / prevAction.getClip().duration;
        curAction.time = prevAction.time * ratio;
      } else {
        curAction.time = 0.0;
        curAction.setEffectiveTimeScale(1.0);
        curAction.setEffectiveWeight(1.0);
      }

      curAction.crossFadeFrom(prevAction, 0.5, true);
      curAction.play();
    } else {
      curAction.play();
    }
  }

  Exit() {
  }

  Update(timeElapsed, input) {
    if (input._keys.forward || input._keys.backward) {
      if (input._keys.shift) {
        this._parent.SetState('run');
      }
      return;
    }

    this._parent.SetState('idle');
  }
};


class RunState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return 'run';
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations['run'].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.enabled = true;

      if (prevState.Name == 'walk') {
        const ratio = curAction.getClip().duration / prevAction.getClip().duration;
        curAction.time = prevAction.time * ratio;
      } else {
        curAction.time = 0.0;
        curAction.setEffectiveTimeScale(1.0);
        curAction.setEffectiveWeight(1.0);
      }

      curAction.crossFadeFrom(prevAction, 0.5, true);
      curAction.play();
    } else {
      curAction.play();
    }
  }

  Exit() {
  }

  Update(timeElapsed, input) {
    if (input._keys.forward || input._keys.backward) {
      if (!input._keys.shift) {
        this._parent.SetState('walk');
      }
      return;
    }

    this._parent.SetState('idle');
  }
};


class IdleState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return 'idle';
  }

  Enter(prevState) {
    const idleAction = this._parent._proxy._animations['idle'].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;
      idleAction.time = 0.0;
      idleAction.enabled = true;
      idleAction.setEffectiveTimeScale(1.0);
      idleAction.setEffectiveWeight(1.0);
      idleAction.crossFadeFrom(prevAction, 0.5, true);
      idleAction.play();
    } else {
      idleAction.play();
    }
  }

  Exit() {
  }

  Update(_, input) {
    if (input._keys.forward || input._keys.backward) {
      this._parent.SetState('walk');
    } else if (input._keys.space) {
      this._parent.SetState('dance');
    }
  }
};


class CharacterControllerDemo {
  constructor() {
    this._Initialize();
  }

  _Initialize() {
    this._threejs = new THREE.WebGLRenderer({
      antialias: true,
    });
    this._threejs.outputEncoding = THREE.sRGBEncoding;
    this._threejs.shadowMap.enabled = true;
    this._threejs.shadowMap.type = THREE.PCFSoftShadowMap;
    this._threejs.setPixelRatio(window.devicePixelRatio);
    this._threejs.setSize(window.innerWidth, window.innerHeight);

    document.body.appendChild(this._threejs.domElement);

    window.addEventListener('resize', () => {
      this._OnWindowResize();
    }, false);

    const fov = 60;
    const aspect = 1920 / 1080;
    const near = 1.0;
    const far = 1000.0;
    this._camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this._camera.position.set(25, 10, 25);

    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x2C3B45);
    

    let light = new THREE.DirectionalLight(0xFFFFFF, 0.15);
    light.position.set(-80, 20, 80);
    light.target.position.set(0, 0, 0);
    light.castShadow = true;
    light.shadow.bias = -0.001;
    light.shadow.mapSize.width = 4096;
    light.shadow.mapSize.height = 4096;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 500.0;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 500.0;
    light.shadow.camera.left = 50;
    light.shadow.camera.right = -50;
    light.shadow.camera.top = 50;
    light.shadow.camera.bottom = -50;
    this._scene.add(light);

    light = new THREE.AmbientLight(0xFFFFFF, 0.05);
    this._scene.add(light);

     // sun
     const sunGeometry = new THREE.SphereGeometry(5, 32, 32);
     const sunMaterial = new THREE.MeshBasicMaterial({ color:  0x5F4330}); // Sun-like color
     const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
     sunMesh.position.set(-80, 20, 80); // Place the sun at y=0
     this._scene.add(sunMesh);


    const controls = new OrbitControls(
    this._camera, this._threejs.domElement);
    controls.target.set(0, 10, 0);
    controls.update();

    controls.minDistance = 1;
    controls.maxDistance = 500;

    this._mixers = [];
    this._previousRAF = null;

    this._isFreeRoam = false;
    this._freeRoamCameraController = new FreeRoamCameraController(this._camera, document);

    document.addEventListener('keydown', (e) => this._onKeyDown(e), false);

    this._LoadAnimatedModel();
    this._LoadMap();
    this._LoadItems();
    this._RAF();
    this._addStreetLights();

    this._controls.addEventListener('change', () => {
      if (this._controls._target) {
        controls.target.copy(this._controls._target);
      }
    });
  }

  _onKeyDown(event) {
    if (event.key === 'v') {
      this._isFreeRoam = !this._isFreeRoam;
    }
  }

  _LoadAnimatedModel() {
    const params = {
      camera: this._camera,
      scene: this._scene,
      controls: this._controls,
    }
    this._controls = new BasicCharacterController(params);
  }

  _LoadAnimatedModelAndPlay(path, modelFile, animFile, offset) {
    const loader = new FBXLoader();
    loader.setPath(path);
    loader.load(modelFile, (fbx) => {
      fbx.scale.setScalar(0.1);
      fbx.traverse(c => {
        c.castShadow = true;
      });
      fbx.position.copy(offset);

      const anim = new FBXLoader();
      anim.setPath(path);
      anim.load(animFile, (anim) => {
        const m = new THREE.AnimationMixer(fbx);
        this._mixers.push(m);
        const idle = m.clipAction(anim.animations[0]);
        idle.play();
      });
      this._scene.add(fbx);
    });
  }

  _LoadMap() {
    const loader = new GLTFLoader();
    loader.load('./resources/cs2.glb', (gltf) => {
      gltf.scene.traverse(c => {
        c.castShadow = true;
        c.receiveShadow = true;
      });

      // Calculate the size of the bounding box
      const bbox = new THREE.Box3().setFromObject(gltf.scene);
      const size = new THREE.Vector3();
      bbox.getSize(size);

      // Calculate scale to fill the plane
      const planeSize = 100; // Adjust this size as per your plane
      const maxDimension = Math.max(size.x, size.y, size.z);
      const scale = planeSize / maxDimension;

      // Apply scale and position adjustments
      gltf.scene.scale.set(scale, scale, scale);

      this._scene.add(gltf.scene);
    });
  }

  _LoadItems() {
    const loader = new GLTFLoader();
    loader.load('./resources/car.glb', (gltf) => {
      gltf.scene.traverse(c => {
        c.castShadow = true;
        c.receiveShadow = true;
      });
      
      gltf.scene.scale.set(0.7, 0.7, 0.7);

      gltf.scene.position.x = 8;
      gltf.scene.position.z = -8;


      this._scene.add(gltf.scene);
    });

    const loader2 = new GLTFLoader();
    loader2.load('./resources/lantern.glb', (gltf) => {
      gltf.scene.traverse(c => {
        c.castShadow = true;
        c.receiveShadow = true;
      });
      
      gltf.scene.scale.set(0.1, 0.1, 0.1);

      gltf.scene.position.x = -6.5;
      gltf.scene.position.z = -5.5;
      // gltf.scene.position.x = -2.2;
      // gltf.scene.position.z = -1.5;
      // gltf.scene.position.x = -1.8;
      // gltf.scene.position.z = 1.5;
      gltf.scene.position.y = 0.1;

      // Create RectAreaLight
      // const rectLight = new THREE.RectAreaLight(0xffffff, 0.2, 0.8, 0.8);
      // rectLight.position.set(0, 0.5, 0); // Adjust the position as needed
      // rectLight.lookAt(0,0,0);
      // gltf.scene.add(rectLight);

      this._scene.add(gltf.scene);
    });

    const loader3 = new GLTFLoader();
    loader3.load('./resources/ship.glb', (gltf) => {
      gltf.scene.traverse(c => {
        c.castShadow = true;
        c.receiveShadow = true;
      });
      
      gltf.scene.scale.set(0.1, 0.1, 0.1);

      gltf.scene.position.y = 0.5;
      gltf.scene.position.x = 6.7;
      gltf.scene.position.z = -11;


      this._scene.add(gltf.scene);
    });

    const loader4 = new GLTFLoader();
    loader4.load('./resources/lantern.glb', (gltf) => {
      gltf.scene.traverse(c => {
        c.castShadow = true;
        c.receiveShadow = true;
      });
      
      gltf.scene.scale.set(0.1, 0.1, 0.1);

     
      gltf.scene.position.x = -2.7;
      gltf.scene.position.z = 6.5;
      gltf.scene.position.y = 0.1;

      // Create RectAreaLight
      // const rectLight = new THREE.RectAreaLight(0xffffff, 0.2, 0.8, 0.8);
      // rectLight.position.set(0, 0.5, 0); // Adjust the position as needed
      // rectLight.lookAt(0,0,0);
      // gltf.scene.add(rectLight);

      this._scene.add(gltf.scene);
    });

    const loader5 = new GLTFLoader();
    loader5.load('./resources/flashlight.glb', (gltf) => {
      gltf.scene.traverse(c => {
        c.castShadow = true;
        c.receiveShadow = true;
      });
      
      gltf.scene.scale.set(1, 1, 1);

      gltf.scene.position.y = 0.7;
      gltf.scene.position.x = 8.3;
      gltf.scene.position.z = -6.5;


      this._scene.add(gltf.scene);
      
// Create a spotlight for the flashlight
      const spotLight = new THREE.SpotLight(0xffffff, 1,20, Math.PI / 6);
      spotLight.position.set(0, 0, 0);
      spotLight.castShadow = true;
      spotLight.shadow.bias = -0.001;
      spotLight.shadow.mapSize.width = 2048;
      spotLight.shadow.mapSize.height = 2048;
      spotLight.shadow.camera.near = 0.1;
      spotLight.shadow.camera.far = 50;
      spotLight.shadow.camera.fov = 30;

      // Add the spotlight as a child of the flashlight model
      gltf.scene.add(spotLight);

      // Set the target of the spotlight to the  where the flashlight is shining
      const spotlightTarget = new THREE.Object3D();
      spotlightTarget.position.set(18, 0, 10);
      gltf.scene.add(spotlightTarget);
      spotLight.target = spotlightTarget;

      // // Optionally, add a SpotLightHelper to visualize the light's coverage area
      // const flashlightLightHelper = new THREE.SpotLightHelper(flashlightTarget);
      // flashlightTarget.add(flashlightLightHelper);

      
    });

    const loader6 = new GLTFLoader();
    loader6.load('./resources/table.glb', (gltf) => {
      gltf.scene.traverse(c => {
        c.castShadow = true;
        c.receiveShadow = true;
      });
      
      gltf.scene.scale.set(0.5, 0.5, 0.5);

      gltf.scene.position.y = 0.3;
      gltf.scene.position.x = 11;
      gltf.scene.position.z = -6.3;


      this._scene.add(gltf.scene);
    });
    
    
    const loader7 = new GLTFLoader();
    loader7.load('./resources/gun.glb', (gltf) => {
      gltf.scene.traverse(c => {
        c.castShadow = true;
        c.receiveShadow = true;
      });
      
      gltf.scene.scale.set(0.05, 0.05, 0.05);

      gltf.scene.position.y = 0.55;
      gltf.scene.position.x = 11;
      gltf.scene.position.z = -6.3;


      this._scene.add(gltf.scene);
    });

  }

  _addStreetLights() {
    const spotLight = new THREE.SpotLight(0xffffff, 4);
    spotLight.angle = Math.PI / 4; // Angle of the spotlight cone (45 degrees)
    spotLight.decay = 3; // Rate of light decay with distance
    spotLight.distance = 30; // How far the light reaches
    spotLight.castShadow = true;
    spotLight.position.set(-12.7, 7, -21);
    spotLight.target.position.set(-22, 0, -28);
    this._scene.add(spotLight);
    this._scene.add(spotLight.target);


    const spotLight2 = new THREE.SpotLight(0xffffff, 10);
    spotLight2.angle = Math.PI / 4; // Angle of the spotlight cone (45 degrees)
    spotLight2.decay = 2; // Rate of light decay with distance
    spotLight2.distance = 20; // How far the light reaches
    spotLight2.castShadow = true;
    spotLight2.receiveShadow = false;
    spotLight2.position.set(-12.5, 7.1, -20.7);
    spotLight2.target.position.set(-6, 0, -15);
    this._scene.add(spotLight2);
    this._scene.add(spotLight2.target);

    const spotLight3 = new THREE.SpotLight(0xffffff, 8);
    spotLight3.angle = Math.PI / 4; // Angle of the spotlight cone (45 degrees)
    spotLight3.decay = 4; // Rate of light decay with distance
    spotLight3.distance = 20; // How far the light reaches
    spotLight3.castShadow = true;
    spotLight3.receiveShadow = false;
    spotLight3.position.set(1.4, 7.3, -6.6);
    spotLight3.target.position.set(-3, 0, -4);
    this._scene.add(spotLight3);
    this._scene.add(spotLight3.target);

    const spotLight4 = new THREE.SpotLight(0xffffff, 7);
    spotLight4.angle = Math.PI / 4; // Angle of the spotlight cone (45 degrees)
    spotLight4.decay = 4; // Rate of light decay with distance
    spotLight4.distance = 20; // How far the light reaches
    spotLight4.castShadow = true;
    spotLight4.receiveShadow = false;
    spotLight4.position.set(1.8, 7.1, -6.7);
    spotLight4.target.position.set(6.5, 0, -12);
    this._scene.add(spotLight4);
    this._scene.add(spotLight4.target);

    const spotLight5 = new THREE.SpotLight(0xffffff, 8);
    spotLight5.angle = Math.PI / 4; // Angle of the spotlight cone (45 degrees)
    spotLight5.decay = 4; // Rate of light decay with distance
    spotLight5.distance = 20; // How far the light reaches
    spotLight5.castShadow = true;
    spotLight5.receiveShadow = false;
    spotLight5.position.set(20.2, 7.1, 12.7);
    spotLight5.target.position.set(5, 0, 10);
    this._scene.add(spotLight5);
    this._scene.add(spotLight5.target);

    const spotLight6 = new THREE.SpotLight(0xffffff, 8);
    spotLight6.angle = Math.PI / 4; // Angle of the spotlight cone (45 degrees)
    spotLight6.decay = 4; // Rate of light decay with distance
    spotLight6.distance = 20; // How far the light reaches
    spotLight6.castShadow = true;
    spotLight6.receiveShadow = false;
    spotLight6.position.set(20.5, 7.1, 12.8);
    spotLight6.target.position.set(37, 0, 11);
    this._scene.add(spotLight6);
    this._scene.add(spotLight6.target);

    // const spotLightHelper = new THREE.SpotLightHelper(spotLight6);
    // this._scene.add(spotLightHelper);

    
}

  _OnWindowResize() {
    this._camera.aspect = window.innerWidth / window.innerHeight;
    this._camera.updateProjectionMatrix();
    this._threejs.setSize(window.innerWidth, window.innerHeight);
  }

  _RAF() {
    requestAnimationFrame((t) => {
      if (this._previousRAF === null) {
        this._previousRAF = t;
      }

      this._RAF();

      this._threejs.render(this._scene, this._camera);
      this._Step(t - this._previousRAF);
      this._previousRAF = t;
    });
  }

  _Step(timeElapsed) {
    const timeElapsedS = timeElapsed * 0.001;

    if (this._mixers) {
      this._mixers.map(m => m.update(timeElapsedS));
    }

    if (this._isFreeRoam) {
      this._freeRoamCameraController.Update(timeElapsedS);
    } else {
      if (this._controls) {
        this._controls.Update(timeElapsedS);

        const characterPosition = this._controls._target.position;
        const cameraPosition = this._camera.position;
        cameraPosition.x = characterPosition.x - 20;
        cameraPosition.z = characterPosition.z + 5;
        cameraPosition.y = characterPosition.y + 15; // Add some vertical offset to the camera position

      }
    }
  }
}

let _APP = null;

window.addEventListener('DOMContentLoaded', () => {
  _APP = new CharacterControllerDemo();
});