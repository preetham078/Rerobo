/**
 * @fileoverview Procedural humanoid robot construction module.
 *
 * Builds a detailed humanoid robot entirely from Three.js primitives
 * (no external model files). Every module (HEAD, NECK, TORSO, ABDOMEN,
 * PELVIS, arms, hands, legs, feet) is a THREE.Group whose userData
 * carries kinematic sub-joint references for real-time retargeting.
 *
 * @module robot
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

/* ------------------------------------------------------------------ */
/*  Material palette                                                  */
/* ------------------------------------------------------------------ */

/** @returns {THREE.MeshStandardMaterial} Main shell (light grey-blue) */
const makeShell      = () => new THREE.MeshStandardMaterial({ color: 0xa8bbc8, metalness: 0.86, roughness: 0.27 });

/** @returns {THREE.MeshStandardMaterial} Lighter shell variant */
const makeShellLight = () => new THREE.MeshStandardMaterial({ color: 0xe1e9ec, metalness: 0.78, roughness: 0.22 });

/** @returns {THREE.MeshStandardMaterial} Dark carbon-fibre panels */
const makeCarbon     = () => new THREE.MeshStandardMaterial({ color: 0x14212a, metalness: 0.35, roughness: 0.36 });

/** @returns {THREE.MeshStandardMaterial} Joint cylinders (dark metallic) */
const makeJointMat   = () => new THREE.MeshStandardMaterial({ color: 0x33414c, metalness: 0.95, roughness: 0.2 });

/** @returns {THREE.MeshStandardMaterial} Accent trim (teal emissive) */
const makeAccent     = () => new THREE.MeshStandardMaterial({ color: 0x167f9c, emissive: 0x07546a, emissiveIntensity: 1.15, metalness: 0.72, roughness: 0.2 });

/** @returns {THREE.MeshStandardMaterial} Rubber (very dark, matte) */
const makeRubber     = () => new THREE.MeshStandardMaterial({ color: 0x0b1116, roughness: 0.62, metalness: 0.15 });

/** @returns {THREE.MeshStandardMaterial} Bolt heads (steel grey) */
const makeBoltMat    = () => new THREE.MeshStandardMaterial({ color: 0x75838b, metalness: 0.9, roughness: 0.24 });

/* ------------------------------------------------------------------ */
/*  Geometry helpers (private)                                        */
/* ------------------------------------------------------------------ */

/**
 * Create a shadow-casting mesh with optional position & rotation.
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Material}       material
 * @param {THREE.Vector3|null}   [position=null]
 * @param {THREE.Euler|null}     [rotation=null]
 * @returns {THREE.Mesh}
 */
function _mesh(geometry, material, position = null, rotation = null) {
  const object = new THREE.Mesh(geometry, material);
  if (position) object.position.copy(position);
  if (rotation) object.rotation.set(rotation.x, rotation.y, rotation.z);
  object.castShadow = object.receiveShadow = true;
  return object;
}

/**
 * Shortcut for a BoxGeometry mesh.
 * @param {number} x - Width
 * @param {number} y - Height
 * @param {number} z - Depth
 * @param {THREE.Material} material
 * @param {THREE.Vector3}  position
 * @returns {THREE.Mesh}
 */
function _box(x, y, z, material, position) {
  return _mesh(new THREE.BoxGeometry(x, y, z), material, position);
}

/**
 * Shortcut for a CylinderGeometry mesh (16 radial segments).
 * @param {number} r1       - Radius top
 * @param {number} r2       - Radius bottom
 * @param {number} h        - Height
 * @param {THREE.Material}  material
 * @param {THREE.Vector3}   [position]
 * @param {THREE.Euler}     [rotation]
 * @returns {THREE.Mesh}
 */
function _cyl(r1, r2, h, material, position, rotation) {
  return _mesh(new THREE.CylinderGeometry(r1, r2, h, 16), material, position, rotation);
}

/* ------------------------------------------------------------------ */
/*  Sub-assembly builders (private)                                   */
/* ------------------------------------------------------------------ */

/**
 * Add a ring of 6 bolts around a parent.
 * @param {THREE.Object3D} parent
 * @param {number}         radius
 * @param {number}         [z=0.22]
 * @param {THREE.Material} boltMat
 */
function _boltRing(parent, radius, z, boltMat) {
  for (let i = 0; i < 6; i += 1) {
    const angle = i / 6 * Math.PI * 2;
    const bolt = _cyl(
      0.028, 0.028, 0.04, boltMat,
      new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, z),
      new THREE.Euler(Math.PI / 2, 0, 0)
    );
    parent.add(bolt);
  }
}

/**
 * Build a ball-joint assembly (cylinder + accent ring + 4 bolts).
 * @param {number} radius
 * @param {number} depth
 * @param {THREE.Material} jointMat
 * @param {THREE.Material} accent
 * @param {THREE.Material} boltMat
 * @returns {THREE.Group}
 */
function _joint(radius, depth, jointMat, accent, boltMat) {
  const group = new THREE.Group();
  group.add(_cyl(radius, radius, depth, jointMat, new THREE.Vector3(), new THREE.Euler(0, Math.PI / 2, 0)));
  const ring = _mesh(
    new THREE.TorusGeometry(radius * 0.69, 0.027, 8, 20), accent,
    new THREE.Vector3(depth / 2 + 0.005, 0, 0),
    new THREE.Euler(0, Math.PI / 2, 0)
  );
  group.add(ring);
  for (let i = 0; i < 4; i += 1) {
    const angle = i * Math.PI / 2;
    group.add(_cyl(
      0.026, 0.026, 0.045, boltMat,
      new THREE.Vector3(depth / 2 + 0.025, Math.cos(angle) * radius * 0.67, Math.sin(angle) * radius * 0.67),
      new THREE.Euler(0, Math.PI / 2, 0)
    ));
  }
  return group;
}

/**
 * Build a limb housing (capsule shell + carbon panel + accent strip + structural cylinder + accent cap).
 * @param {number} length
 * @param {number} width
 * @param {number} side   – 1 or -1
 * @param {THREE.Material} shellLight
 * @param {THREE.Material} carbon
 * @param {THREE.Material} accent
 * @param {THREE.Material} jointMat
 * @returns {THREE.Group}
 */
function _limbHousing(length, width, side, shellLight, carbon, accent, jointMat) {
  const group = new THREE.Group();
  group.add(_mesh(new THREE.CapsuleGeometry(width, Math.max(0.08, length - width * 2), 6, 14), shellLight));
  group.add(_box(width * 1.33, length * 0.64, width * 0.9, carbon, new THREE.Vector3(0, 0, width * 0.52)));
  group.add(_box(width * 0.34, length * 0.56, width * 0.11, accent, new THREE.Vector3(side * width * 0.72, 0, width * 0.58)));
  group.add(_cyl(0.045, 0.045, length * 0.72, jointMat, new THREE.Vector3(-side * width * 0.7, 0, width * 0.42)));
  group.add(_cyl(0.066, 0.066, 0.07, accent, new THREE.Vector3(-side * width * 0.7, length * 0.25, width * 0.42), new THREE.Euler(Math.PI / 2, 0, 0)));
  return group;
}

/* ------------------------------------------------------------------ */
/*  Module builders (one per body part)                               */
/* ------------------------------------------------------------------ */

/**
 * Create the HEAD module.
 * @param {Function} addModule – registers group on root
 * @param {Object}   mats      – material palette
 * @returns {THREE.Group}
 */
function _buildHead(addModule, mats) {
  const head = addModule('HEAD', 'HEAD MODULE', new THREE.Vector3(0, 3.28, 0.02), new THREE.Vector3(0, 0.62, 0.06), 5.6);
  // Skull
  const skull = _mesh(new THREE.SphereGeometry(0.43, 20, 16), mats.shellLight);
  skull.scale.set(0.9, 1.14, 0.88);
  head.add(skull);
  // Face plate (carbon)
  head.add(_box(0.58, 0.29, 0.14, mats.carbon, new THREE.Vector3(0, -0.06, 0.38)));
  // Eyes (accent spheres)
  [-0.18, 0.18].forEach((x) => {
    head.add(_mesh(new THREE.SphereGeometry(0.072, 12, 10), mats.accent, new THREE.Vector3(x, 0.02, 0.47)));
  });
  // Jaw
  head.add(_box(0.18, 0.09, 0.06, mats.jointMat, new THREE.Vector3(0, -0.22, 0.46)));
  // Ears (joints)
  [-1, 1].forEach((side) => {
    const ear = _joint(0.16, 0.12, mats.jointMat, mats.accent, mats.boltMat);
    ear.rotation.y = Math.PI / 2;
    ear.position.set(side * 0.43, 0.04, 0);
    head.add(ear);
  });
  // Bolt ring
  _boltRing(head, 0.3, 0.41, mats.boltMat);
  return head;
}

/**
 * Create the NECK module.
 * @param {Function} addModule
 * @param {Object}   mats
 * @returns {THREE.Group}
 */
function _buildNeck(addModule, mats) {
  const neck = addModule('NECK', 'NECK & HEAD JOINT', new THREE.Vector3(0, 2.72, 0), new THREE.Vector3(0, 0.25, 0), 5.4);
  neck.add(_cyl(0.17, 0.2, 0.35, mats.jointMat, new THREE.Vector3()));
  neck.add(_mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 20), mats.accent, new THREE.Vector3(0, 0.15, 0)));
  return neck;
}

/**
 * Create the TORSO module.
 * @param {Function} addModule
 * @param {Object}   mats
 * @returns {THREE.Group}
 */
function _buildTorso(addModule, mats) {
  const torso = addModule('TORSO', 'UPPER TORSO MODULE', new THREE.Vector3(0, 1.88, 0), new THREE.Vector3(0, 0.12, 0.08), 7.3);
  torso.add(_box(1.4, 0.86, 0.54, mats.shellLight, new THREE.Vector3(0, 0, 0)));
  torso.add(_box(0.82, 0.64, 0.12, mats.carbon, new THREE.Vector3(0, -0.01, 0.34)));
  torso.add(_box(0.12, 0.52, 0.07, mats.accent, new THREE.Vector3(0, 0.02, 0.42)));
  [-0.57, 0.57].forEach((x) => {
    torso.add(_box(0.2, 0.72, 0.57, mats.shell, new THREE.Vector3(x, 0, -0.01)));
    _boltRing(torso, 0.23, 0.31, mats.boltMat);
  });
  return torso;
}

/**
 * Create the ABDOMEN module.
 * @param {Function} addModule
 * @param {Object}   mats
 * @returns {THREE.Group}
 */
function _buildAbdomen(addModule, mats) {
  const abdomen = addModule('ABDOMEN', 'CHEST / ABDOMEN MODULE', new THREE.Vector3(0, 0.98, 0), new THREE.Vector3(0, -0.08, 0.06), 6.7);
  abdomen.add(_cyl(0.43, 0.51, 0.62, mats.carbon, new THREE.Vector3()));
  abdomen.add(_box(0.5, 0.36, 0.11, mats.shell, new THREE.Vector3(0, 0, 0.42)));
  abdomen.add(_cyl(0.06, 0.06, 0.5, mats.accent, new THREE.Vector3(0.31, 0, 0.3)));
  return abdomen;
}

/**
 * Create the PELVIS module.
 * @param {Function} addModule
 * @param {Object}   mats
 * @returns {THREE.Group}
 */
function _buildPelvis(addModule, mats) {
  const pelvis = addModule('PELVIS', 'HIP / PELVIS MODULE', new THREE.Vector3(0, 0.28, 0), new THREE.Vector3(0, -0.18, 0.02), 6.5);
  pelvis.add(_box(1.05, 0.43, 0.52, mats.shellLight, new THREE.Vector3()));
  pelvis.add(_box(0.66, 0.2, 0.1, mats.carbon, new THREE.Vector3(0, 0.05, 0.32)));
  [-0.4, 0.4].forEach((x) => {
    const hip = _joint(0.2, 0.32, mats.jointMat, mats.accent, mats.boltMat);
    hip.position.set(x, -0.18, 0);
    pelvis.add(hip);
  });
  return pelvis;
}

/**
 * Create an ARM module (LEFT or RIGHT).
 * @param {number}   side       – -1 = left, +1 = right
 * @param {Function} addModule
 * @param {Object}   mats
 * @returns {THREE.Group}
 */
function _buildArm(side, addModule, mats) {
  const x = side * 1.02;
  const group = addModule(
    side < 0 ? 'LEFT_ARM' : 'RIGHT_ARM',
    side < 0 ? 'LEFT ARM MODULE' : 'RIGHT ARM MODULE',
    new THREE.Vector3(x, 1.72, 0),
    new THREE.Vector3(side * 0.7, 0.08, 0),
    6.8
  );
  // Shoulder joint
  const shoulder = _joint(0.27, 0.34, mats.jointMat, mats.accent, mats.boltMat);
  shoulder.position.set(side * 0.08, 0, 0);
  group.add(shoulder);
  // Shoulder cap
  const shoulderCap = _mesh(new THREE.SphereGeometry(0.34, 16, 12), mats.shell, new THREE.Vector3(side * 0.11, 0, 0));
  shoulderCap.scale.set(1.12, 0.9, 0.88);
  group.add(shoulderCap);
  // Upper arm housing
  const upper = _limbHousing(0.88, 0.2, side, mats.shellLight, mats.carbon, mats.accent, mats.jointMat);
  upper.position.set(side * 0.28, -0.6, 0);
  group.add(upper);
  // Elbow joint
  const elbow = _joint(0.19, 0.29, mats.jointMat, mats.accent, mats.boltMat);
  elbow.position.set(side * 0.27, -1.12, 0);
  group.add(elbow);
  // Forearm housing
  const forearm = _limbHousing(0.78, 0.18, side, mats.shellLight, mats.carbon, mats.accent, mats.jointMat);
  forearm.position.set(side * 0.32, -1.64, 0);
  group.add(forearm);
  // Wrist joint
  const wrist = _joint(0.12, 0.2, mats.jointMat, mats.accent, mats.boltMat);
  wrist.position.set(side * 0.3, -2.1, 0);
  group.add(wrist);
  // Kinematics references
  group.userData.kinematics = { upper, elbow, forearm, wrist };
  return group;
}

/**
 * Create a HAND module (LEFT or RIGHT).
 * @param {number}   side       – -1 = left, +1 = right
 * @param {Function} addModule
 * @param {Object}   mats
 * @returns {THREE.Group}
 */
function _buildHand(side, addModule, mats) {
  const group = addModule(
    side < 0 ? 'LEFT_HAND' : 'RIGHT_HAND',
    side < 0 ? 'LEFT ROBOTIC HAND' : 'RIGHT ROBOTIC HAND',
    new THREE.Vector3(side * 1.35, -0.44, 0.02),
    new THREE.Vector3(side * 1.05, -0.18, 0.04),
    5.5
  );
  // Palm
  group.add(_box(0.34, 0.42, 0.2, mats.shellLight, new THREE.Vector3(0, 0, 0.02)));
  // Carbon inset
  group.add(_box(0.22, 0.28, 0.1, mats.carbon, new THREE.Vector3(0, -0.02, 0.14)));
  // Fingers (4 digits × 3 phalanges)
  const fingerX = [-0.13, -0.045, 0.045, 0.13];
  const fingers = [];
  fingerX.forEach((finger, index) => {
    const digit = new THREE.Group();
    digit.position.set(finger, -0.27, 0.02);
    group.add(digit);
    fingers.push(digit);
    for (let segment = 0; segment < 3; segment += 1) {
      const length = segment === 0 ? 0.17 : 0.125;
      const phalanx = _box(0.052, length, 0.062, mats.shell, new THREE.Vector3(0, -segment * 0.135, 0));
      digit.add(phalanx);
      if (segment < 2) {
        digit.add(_cyl(
          0.04, 0.04, 0.075, mats.jointMat,
          new THREE.Vector3(0, -segment * 0.135 - length / 2, 0),
          new THREE.Euler(0, 0, Math.PI / 2)
        ));
      }
    }
    digit.rotation.z = (index - 1.5) * 0.08;
  });
  // Thumb
  const thumb = new THREE.Group();
  thumb.position.set(side * 0.22, -0.08, 0);
  thumb.rotation.z = side * -0.68;
  group.add(thumb);
  thumb.add(_box(0.055, 0.19, 0.066, mats.shell, new THREE.Vector3(0, -0.08, 0)));
  thumb.add(_box(0.05, 0.14, 0.06, mats.shellLight, new THREE.Vector3(0, -0.23, 0)));
  // Kinematics references
  group.userData.kinematics = { fingers, thumb };
  return group;
}

/**
 * Create a LEG module (LEFT or RIGHT).
 * @param {number}   side       – -1 = left, +1 = right
 * @param {Function} addModule
 * @param {Object}   mats
 * @returns {THREE.Group}
 */
function _buildLeg(side, addModule, mats) {
  const group = addModule(
    side < 0 ? 'LEFT_LEG' : 'RIGHT_LEG',
    side < 0 ? 'LEFT LEG MODULE' : 'RIGHT LEG MODULE',
    new THREE.Vector3(side * 0.41, 0.12, 0),
    new THREE.Vector3(side * 0.45, -0.15, 0.02),
    7.6
  );
  // Hip joint
  const hip = _joint(0.21, 0.3, mats.jointMat, mats.accent, mats.boltMat);
  hip.position.set(0, 0, 0);
  group.add(hip);
  // Thigh housing
  const thigh = _limbHousing(1.02, 0.25, side, mats.shellLight, mats.carbon, mats.accent, mats.jointMat);
  thigh.position.set(0, -0.64, 0);
  group.add(thigh);
  // Knee joint
  const knee = _joint(0.23, 0.32, mats.jointMat, mats.accent, mats.boltMat);
  knee.position.set(0, -1.27, 0.02);
  group.add(knee);
  // Shin housing
  const shin = _limbHousing(1.02, 0.23, -side, mats.shellLight, mats.carbon, mats.accent, mats.jointMat);
  shin.position.set(0, -1.91, 0);
  group.add(shin);
  // Ankle joint
  const ankle = _joint(0.14, 0.25, mats.jointMat, mats.accent, mats.boltMat);
  ankle.position.set(0, -2.48, 0.02);
  group.add(ankle);
  // Kinematics references
  group.userData.kinematics = { thigh, knee, shin, ankle };
  return group;
}

/**
 * Create a FOOT module (LEFT or RIGHT).
 * @param {number}   side       – -1 = left, +1 = right
 * @param {Function} addModule
 * @param {Object}   mats
 * @returns {THREE.Group}
 */
function _buildFoot(side, addModule, mats) {
  const group = addModule(
    side < 0 ? 'LEFT_FOOT' : 'RIGHT_FOOT',
    side < 0 ? 'LEFT MECHANICAL FOOT' : 'RIGHT MECHANICAL FOOT',
    new THREE.Vector3(side * 0.41, -2.44, 0.12),
    new THREE.Vector3(side * 0.34, -0.09, 0.22),
    5.8
  );
  // Foot box
  group.add(_box(0.42, 0.18, 0.73, mats.shellLight, new THREE.Vector3(0, -0.05, 0.12)));
  // Carbon panel
  group.add(_box(0.3, 0.11, 0.4, mats.carbon, new THREE.Vector3(0, 0.04, 0.27)));
  // Axle cylinder
  group.add(_cyl(0.065, 0.065, 0.44, mats.jointMat, new THREE.Vector3(side * 0.18, -0.05, 0.08), new THREE.Euler(0, 0, Math.PI / 2)));
  // Rubber sole
  group.add(_box(0.44, 0.06, 0.79, mats.rubber, new THREE.Vector3(0, -0.16, 0.13)));
  return group;
}

/* ------------------------------------------------------------------ */
/*  Main public API                                                   */
/* ------------------------------------------------------------------ */

/**
 * Creates the procedural humanoid robot with all modules and kinematics.
 *
 * The returned group has:
 * - `root.userData.modules`   – keyed map of every body-part group
 * - `root.userData.pickables` – flat array of every mesh (for raycasting)
 *
 * @returns {THREE.Group} The robot root group
 */
export function createHumanoidRobot() {
  const root = new THREE.Group();
  root.name = 'Robot';

  /** @type {Object<string, THREE.Group>} */
  const modules = {};

  /** @type {THREE.Mesh[]} */
  const pickables = [];

  /* ---------- Materials (shared across all modules) ---------- */
  const mats = {
    shell:      makeShell(),
    shellLight: makeShellLight(),
    carbon:     makeCarbon(),
    jointMat:   makeJointMat(),
    accent:     makeAccent(),
    rubber:     makeRubber(),
    boltMat:    makeBoltMat(),
  };

  /* ---------- Module registration helper ---------- */

  /**
   * Create and register a new module group on the robot root.
   * @param {string}        key
   * @param {string}        label
   * @param {THREE.Vector3} position
   * @param {THREE.Vector3} explode    – direction/magnitude for explode view
   * @param {number}        [focusRadius=6.5]
   * @returns {THREE.Group}
   */
  const addModule = (key, label, position, explode, focusRadius = 6.5) => {
    const group = new THREE.Group();
    group.name = key;
    group.position.copy(position);
    group.userData = {
      key,
      label,
      base: position.clone(),
      explode: explode.clone(),
      targetExplode: 0,
      focusRadius,
    };
    root.add(group);
    modules[key] = group;
    return group;
  };

  /* ---------- Build every body part ---------- */

  _buildHead(addModule, mats);
  _buildNeck(addModule, mats);
  _buildTorso(addModule, mats);
  _buildAbdomen(addModule, mats);
  _buildPelvis(addModule, mats);

  // Arms & hands (left = -1, right = +1)
  _buildArm(-1, addModule, mats);
  _buildArm(1, addModule, mats);
  _buildHand(-1, addModule, mats);
  _buildHand(1, addModule, mats);

  // Legs & feet
  _buildLeg(-1, addModule, mats);
  _buildLeg(1, addModule, mats);
  _buildFoot(-1, addModule, mats);
  _buildFoot(1, addModule, mats);

  /* ---------- Spine cable ---------- */
  const spineCable = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.28, 2.3, -0.32),
    new THREE.Vector3(-0.4, 1.25, -0.45),
    new THREE.Vector3(-0.24, 0.38, -0.34),
  ]);
  root.add(_mesh(new THREE.TubeGeometry(spineCable, 18, 0.026, 6, false), mats.accent));

  /* ---------- Plinth ---------- */
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x101b22, metalness: 0.6, roughness: 0.34 });
  const plinth = _mesh(
    new THREE.CylinderGeometry(1.55, 1.75, 0.08, 48),
    plinthMat,
    new THREE.Vector3(0, -2.69, 0.1)
  );
  root.add(plinth);

  /* ---------- Tag every mesh as pickable ---------- */
  Object.values(modules).forEach((part) => {
    part.traverse((child) => {
      if (child.isMesh) {
        child.userData.partKey = part.userData.key;
        pickables.push(child);
      }
    });
  });

  /* ---------- Finalise ---------- */
  root.userData = { modules, pickables };
  root.scale.setScalar(1.06);
  return root;
}

/* ------------------------------------------------------------------ */
/*  Pose helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Set a target pose rotation for a robot module.
 *
 * The actual rotation is applied lazily via {@link animateRobot} each
 * frame so that motion is smoothed with lerp interpolation.
 *
 * @param {Object<string, THREE.Group>} modules – `robot.userData.modules`
 * @param {string}  key – Module key (e.g. 'HEAD', 'LEFT_ARM')
 * @param {number}  [x=0] – Target rotation X (radians)
 * @param {number}  [y=0] – Target rotation Y (radians)
 * @param {number}  [z=0] – Target rotation Z (radians)
 */
export function setPoseRotation(modules, key, x = 0, y = 0, z = 0) {
  const mod = modules[key];
  if (!mod) return;
  if (!mod.userData.targetRotation) {
    mod.userData.targetRotation = new THREE.Euler(x, y, z);
  } else {
    mod.userData.targetRotation.set(x, y, z);
  }
}

/**
 * Animate all robot modules toward their target pose rotations.
 *
 * Call once per frame inside the render loop. Each module that has a
 * `userData.targetRotation` will be smoothly interpolated toward it.
 *
 * @param {Object<string, THREE.Group>} modules – `robot.userData.modules`
 * @param {number} [lerpFactor=0.12] – Interpolation factor (0 = no change, 1 = snap)
 */
export function animateRobot(modules, lerpFactor = 0.12) {
  for (const key in modules) {
    const mod = modules[key];
    const target = mod.userData.targetRotation;
    if (!target) continue;

    mod.rotation.x += (target.x - mod.rotation.x) * lerpFactor;
    mod.rotation.y += (target.y - mod.rotation.y) * lerpFactor;
    mod.rotation.z += (target.z - mod.rotation.z) * lerpFactor;
  }
}
