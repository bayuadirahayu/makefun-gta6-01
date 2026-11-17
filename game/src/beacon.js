// The mission waypoint beacon: a tall translucent pillar of light with a spinning diamond
// floating above it, marking where the player has to go. It is pure visuals — the mission
// logic only reports a marker position, and this draws it. Hidden when there is no marker.

import * as THREE from 'three';

export function createBeacon() {
  const group = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 34, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd23e,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  pillar.position.y = 17;
  group.add(pillar);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, toneMapped: false }),
  );
  diamond.position.y = 5;
  group.add(diamond);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.0, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.6, side: THREE.DoubleSide, toneMapped: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  group.add(ring);
  group.visible = false;
  return {
    group,
    /** Show the beacon at `marker` ({x, z}) or hide it when marker is null. */
    update(marker, time) {
      if (!marker) {
        group.visible = false;
        return;
      }
      group.visible = true;
      group.position.set(marker.x, 0, marker.z);
      diamond.position.y = 5 + Math.sin(time * 2) * 0.6;
      diamond.rotation.y = time * 1.4;
      const pulse = 1 + Math.sin(time * 3) * 0.12;
      ring.scale.set(pulse, pulse, 1);
    },
  };
}
