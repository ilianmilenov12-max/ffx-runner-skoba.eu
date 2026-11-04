// Сенките — пренесен "ParentScript 9 - Shadow".
//
// Оригиналът не хвърля истинска сянка: слага плоско петно в точката, където
// лъчът към земята е ударил, вдига го на G.shadowHeight над нея и го завърта
// по нормалата на настилката. Затова сянката ляга по рампите и стъпалата.

import * as THREE from 'three';
import { RIDE_HEIGHT } from './params.js?v=163';

const UP = new THREE.Vector3(0, 0, 1);

export function makeShadow(scene, size) {
  const geometry = new THREE.CircleGeometry(0.5, 20);
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(size.width * 0.95, size.length * 0.9, 1);
  mesh.renderOrder = 1;
  scene.add(mesh);
  return mesh;
}

const align = new THREE.Quaternion();
const yaw = new THREE.Quaternion();

/** Пада в точката на допира, легнала по настилката и завъртяна с колата. */
export function updateShadow(shadow, vehicle, drawnAt) {
  const visible = !!vehicle.contact && vehicle.height < 12;
  shadow.visible = visible;
  if (!visible) return;

  // Точката на допира идва от физиката, която върви на 25 Hz, а колата се
  // рисува интерполирана — затова сянката изоставаше от нея при скорост.
  shadow.position.copy(vehicle.contact).addScaledVector(vehicle.normal, RIDE_HEIGHT);
  if (drawnAt) { shadow.position.x = drawnAt.x; shadow.position.y = drawnAt.y; }

  const heading = Math.atan2(vehicle.forwardVector.y, vehicle.forwardVector.x);
  align.setFromUnitVectors(UP, vehicle.normal);
  yaw.setFromAxisAngle(UP, heading - Math.PI / 2);
  shadow.quaternion.copy(align).multiply(yaw);
}
