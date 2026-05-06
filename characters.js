// ===== SHADOW FIGHT STYLE CHARACTER ANIMATION =====
// Joint-based skeletal animation with anticipation, action, follow-through, recovery

function lerp(a, b, t) { return a + (b - a) * Math.clamp(t, 0, 1); }
Math.clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
const easeIn = t => t * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
function mixPose(a, b, t) {
  return a.map((v, i) => lerp(v, b[i], t));
}

// ─── HERO DRAW ───────────────────────────────────────────────────────────────
function drawHero(ctx, f) {
  const hx = f.hit ? 4 * (Math.random() - 0.5) : 0;
  const hy = f.hit ? 4 * (Math.random() - 0.5) : 0;
  ctx.save();
  ctx.translate(f.x + hx, f.y + hy);
  ctx.scale(f.facing, 1);

  // Idle breathing: subtle up/down
  const breath = Math.sin(f.bounceT * 1.8) * 2;
  // Squat on landing
  const squat = f.landSqt || 0;
  // Airborne stretch
  const airStretch = f.grounded ? 0 : Math.clamp(-f.vy / 900, -0.18, 0.22);

  // === POSE SELECTION ===
  let pose = 'idle';
  if (f.animState === 'windup')   pose = 'windup';
  else if (f.animState === 'strike')  pose = 'strike';
  else if (f.animState === 'hold')    pose = 'hold';
  else if (f.animState === 'recover') pose = 'recover';
  else if (f.animState === 'hitstun') pose = 'hitstun';
  else if (!f.grounded)              pose = 'jump';
  else if (Math.abs(f.vx) > 20)     pose = 'walk';

  const p = f.animT || 0; // 0→1 progress within current phase

  // === JOINT ANGLES (degrees, all relative) ===
  // [torsoLean, hipAngle, shoulderL, elbowL, shoulderR, elbowR, thighL, kneeL, thighR, kneeR]
  const poses = {
    idle:    [  8,  0, -30,  45, -50,  40,  -8,  12,   8,  10],
    walk:    [  6,  0, -35 + Math.sin(f.walkCycle * 1.1) * 20,
                      40, -45 + Math.sin(f.walkCycle * 1.1 + Math.PI) * 20,
                      35,
                      15 + Math.sin(f.walkCycle * 1.1) * 22, 20 + Math.abs(Math.sin(f.walkCycle * 1.1)) * 18,
                      15 - Math.sin(f.walkCycle * 1.1) * 22, 20 + Math.abs(Math.sin(f.walkCycle * 1.1 + Math.PI)) * 18],
    jump:    [ 12,  0, -55, 30, -60,  25,  -30,  5,  -30,   8],
    punchWindup: [ 16, -8, -18, 82,  -92, 18,  -12,  18,  12,  16],
    punchStrike: [  1, 10, -34, 28,   28,  2,  -18,  20,  10,  13],
    punchHold:   [ -1, 13, -38, 20,   34,  0,  -20,  22,  11,  14],
    kickWindup:  [ 20,-14, -44, 48,  -58, 38,  -22,  18, -54,  70],
    kickStrike:  [  4, 18, -42, 40,  -52, 34,  -26,  24,  70,   2],
    kickHold:    [  2, 21, -40, 36,  -50, 32,  -28,  24,  78,   0],
    recover: [  9,  0, -28, 35, -45, 38,   -9,  12,   7,  10],
    hitstun: [-10,  0,  20, 60,  20, 60,   10,  25,  -10, 20],
  };

  let angles = poses[pose] ? [...poses[pose]] : [...poses.idle];
  const isKick = f.attackMove === 'kick';
  const windupPose = isKick ? poses.kickWindup : poses.punchWindup;
  const strikePose = isKick ? poses.kickStrike : poses.punchStrike;
  const holdPose = isKick ? poses.kickHold : poses.punchHold;

  if (pose === 'windup') {
    angles = mixPose(poses.idle, windupPose, easeOut(p));
  } else if (pose === 'strike') {
    angles = mixPose(windupPose, strikePose, easeIn(p));
  } else if (pose === 'hold') {
    angles = mixPose(strikePose, holdPose, easeOut(p));
  } else if (pose === 'recover') {
    angles = mixPose(holdPose, poses.recover, easeInOut(p));
  } else if (pose === 'hitstun') {
    angles = mixPose(poses.hitstun, poses.idle, easeInOut(p));
  }

  // Squat compression on landing
  const squatLean = squat * 12;

  const d2r = v => v * Math.PI / 180;

  // torso
  const torsoLean = (angles[0] + squatLean) * (Math.PI / 180);
  const hipTwist = d2r(angles[1]);
  const hipShift = Math.sin(hipTwist) * 4;
  // Rubber stretch: hero body squash/stretch
  const rubberActive = (f.atkType === 'rubber' || f.atkType === 'giant') && (f.animState === 'strike' || f.animState === 'hold');
  const giantActive = f.atkType === 'giant' && rubberActive;
  const rStretch = rubberActive ? 1 + f.rubberStretch * (giantActive ? 0.34 : 0.25) : 1 - squat * 0.18;
  const rSquash  = rubberActive ? 1 - f.rubberStretch * (giantActive ? 0.16 : 0.12) : 1 + squat * 0.22;
  // ── DRAW ORDER: back leg → back arm → body → front arm → head ──

  // === CLOUD AURA ===
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const ax = Math.sin(f.bounceT * 1.2 + i * 1.3) * 10;
    const ay = -28 + breath + Math.cos(f.bounceT * 0.9 + i * 1.7) * 6;
    ctx.globalAlpha = 0.06 + Math.sin(f.bounceT + i) * 0.02;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#aaeeff'; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(ax, ay, 7 + Math.sin(f.bounceT + i) * 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  const hitCol = f.hit ? '#ff8888' : null;

  // === TORSO PIVOT POINT ===
  const ty = -22 + breath - squat * 6; // torso center Y

  // BACK LEG (thigh R, knee R in local facing space = left visual)
  drawLeg(ctx, 3 + hipShift, ty + 14, d2r(angles[6] + 5), d2r(angles[7] + 3), hitCol || '#b0b0c8', 5, rSquash);
  // BACK ARM
  drawArm(ctx, -3 - hipShift * 0.35, ty - 8, d2r(angles[2] - 8), d2r(angles[3] + 8), hitCol || '#d0d0e8',
          4, 13, 12, false, false);

  // === TORSO ===
  ctx.save();
  ctx.translate(hipShift * 0.45, ty);
  ctx.rotate(torsoLean * 0.4 + hipTwist * 0.25);
  ctx.scale(rSquash, rStretch);
  ctx.fillStyle = hitCol || '#e8e8f0';
  ctx.shadowColor = '#aaeeff'; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = hitCol || 'rgba(180,200,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-8, 7); ctx.lineTo(8, 7); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  // FRONT LEG (thigh L, knee L)
  drawLeg(ctx, -3 + hipShift, ty + 14, d2r(angles[8]), d2r(angles[9]), hitCol || '#c8c8d8', 5, rSquash);

  // FRONT ARM (attacking arm = right side for facing=1)
  const isAttacking = pose === 'windup' || pose === 'strike' || pose === 'hold';
  if (rubberActive) {
    // Rubber stretch arm
    const rLen = 20 + f.rubberStretch * (giantActive ? 76 : 52);
    ctx.save();
    ctx.lineWidth = giantActive ? 7 : 4.5; ctx.lineCap = 'round';
    ctx.strokeStyle = hitCol || '#e0e0ee';
    ctx.shadowColor = giantActive ? '#ff5533' : '#ffe066'; ctx.shadowBlur = rubberActive ? (giantActive ? 26 : 18) : 0;
    // Upper arm
    ctx.beginPath(); ctx.moveTo(3 + hipShift * 0.35, ty - 8); ctx.lineTo(3 + rLen * 0.35, ty - 10); ctx.stroke();
    // Forearm
    ctx.beginPath(); ctx.moveTo(3 + rLen * 0.35, ty - 10); ctx.lineTo(3 + rLen, ty - 8); ctx.stroke();
    // Fist
    ctx.fillStyle = giantActive ? '#ffe0d8' : '#fff';
    ctx.beginPath(); ctx.arc(3 + rLen + 4, ty - 8, giantActive ? 12 : 5, 0, Math.PI * 2); ctx.fill();
    // Trail
    if (f.rubberStretch > 0.2) {
      ctx.save(); ctx.globalAlpha = 0.22; ctx.strokeStyle = '#aaeeff';
      ctx.setLineDash([3, 6]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(3, ty - 8); ctx.lineTo(3 + rLen * 1.1, ty - 8); ctx.stroke();
      ctx.restore();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  } else {
    drawArm(ctx, 3 + hipShift * 0.35, ty - 8, d2r(angles[4]), d2r(angles[5]), hitCol || '#e0e0ee',
            4.5, 14, 12, isAttacking, f.hit);
  }

  // === HEAD ===
  const headY = ty - 28 + breath * 0.5;
  ctx.save();
  ctx.translate(0, headY);
  ctx.rotate(torsoLean * 0.3 + (pose === 'hitstun' ? 0.25 : 0));

  // Head
  ctx.fillStyle = hitCol || '#f0eef5';
  ctx.shadowColor = '#aaeeff'; ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Hair
  ctx.fillStyle = hitCol || '#fff';
  ctx.shadowColor = '#fff'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(0, -8, 9, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-7, -5, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(7, -5, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-4, -11, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(5, -10, 6, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(-4, 0, 3.5, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(4, 0, 3.5, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(-3.5, 0, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(4.5, 0, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-4.5, -1, 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(3.5, -1, 0.7, 0, Math.PI * 2); ctx.fill();

  // Mouth
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
  if (isAttacking) {
    ctx.beginPath(); ctx.arc(0, 4, 3, 0, Math.PI); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(-2, 4); ctx.lineTo(2, 4); ctx.stroke();
  }
  ctx.restore();

  ctx.restore();
}

// ─── BOSS DRAW ────────────────────────────────────────────────────────────────
function drawBoss(ctx, f) {
  const hx = f.hit ? 5 * (Math.random() - 0.5) : 0;
  const hy = f.hit ? 5 * (Math.random() - 0.5) : 0;
  ctx.save();
  ctx.translate(f.x + hx, f.y + hy);
  ctx.scale(f.facing, 1);

  const breath = Math.sin(f.bounceT * 1.1) * 1.5; // slower, heavier
  const squat = f.landSqt || 0;

  let pose = 'idle';
  if (f.animState === 'windup')   pose = 'windup';
  else if (f.animState === 'strike')  pose = 'strike';
  else if (f.animState === 'hold')    pose = 'hold';
  else if (f.animState === 'recover') pose = 'recover';
  else if (f.animState === 'hitstun') pose = 'hitstun';
  else if (!f.grounded)              pose = 'jump';
  else if (Math.abs(f.vx) > 20)     pose = 'walk';

  const p = f.animT || 0;
  const d2r = v => v * Math.PI / 180;

  // Boss pose angles (more controlled, slower)
  const poses = {
    idle:    [  5,  0, -22, 35, -42, 32,  -5,  8,   5,  8],
    walk:    [  4,  0, -28 + Math.sin(f.walkCycle * 0.8) * 14,
                      30, -38 + Math.sin(f.walkCycle * 0.8 + Math.PI) * 14,
                      28,
                      10 + Math.sin(f.walkCycle * 0.8) * 16, 15 + Math.abs(Math.sin(f.walkCycle * 0.8)) * 14,
                      10 - Math.sin(f.walkCycle * 0.8) * 16, 15 + Math.abs(Math.sin(f.walkCycle * 0.8 + Math.PI)) * 14],
    jump:    [  8,  0, -48, 22, -52, 20, -25,  4, -25,  5],
    punchWindup: [ 10, -5,  10, 70, -74, 12,  -6, 10,   8, 10],
    punchStrike: [  1,  8, -18,  8,  18,  6,  -8, 12,   7,  8],
    punchHold:   [ -1, 10, -20,  6,  22,  4,  -9, 12,   7,  8],
    kickWindup:  [ 13,-10, -30, 36, -46, 28, -15, 12, -44, 62],
    kickStrike:  [  2, 14, -28, 30, -42, 24, -18, 16,  64,  2],
    kickHold:    [  0, 16, -28, 28, -40, 22, -20, 16,  70,  0],
    recover: [  6,  0, -22, 30, -40, 30,  -5,  8,   5,  8],
    hitstun: [-12,  0,  25, 65,  25, 65,   8, 20,  -8, 18],
  };

  let angles = poses[pose] ? [...poses[pose]] : [...poses.idle];
  const isKick = f.attackMove === 'kick';
  const windupPose = isKick ? poses.kickWindup : poses.punchWindup;
  const strikePose = isKick ? poses.kickStrike : poses.punchStrike;
  const holdPose = isKick ? poses.kickHold : poses.punchHold;

  if (pose === 'windup') {
    angles = mixPose(poses.idle, windupPose, easeOut(p));
  } else if (pose === 'strike') {
    angles = mixPose(windupPose, strikePose, easeIn(p));
  } else if (pose === 'hold') {
    angles = mixPose(strikePose, holdPose, easeOut(p));
  } else if (pose === 'recover') {
    angles = mixPose(holdPose, poses.recover, easeInOut(p));
  } else if (pose === 'hitstun') {
    angles = mixPose(poses.hitstun, poses.idle, easeInOut(p));
  }

  const torsoLean = d2r(angles[0]);
  const hipTwist = d2r(angles[1]);
  const hipShift = Math.sin(hipTwist) * 3;
  const squatAmt  = 1 + squat * 0.2;
  const ty = -26 + breath - squat * 5;

  const hitCol = f.hit ? '#ff4444' : null;

  // === DARK AURA ===
  ctx.save();
  for (let i = 0; i < 7; i++) {
    const ax = Math.sin(f.bounceT * 0.7 + i * 0.9) * 13;
    const ay = -30 + Math.cos(f.bounceT * 0.5 + i * 1.1) * 10 - i * 2.5;
    ctx.globalAlpha = 0.08 + Math.sin(f.bounceT * 0.8 + i) * 0.03;
    ctx.fillStyle = '#220000';
    ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(ax, ay, 9 + Math.sin(f.bounceT * 0.6 + i) * 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // Cloak
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#08000a';
  ctx.beginPath();
  ctx.moveTo(-14, ty - 12);
  ctx.quadraticCurveTo(-20, ty + 10 + Math.sin(f.bounceT) * 3, -16, ty + 22);
  ctx.lineTo(16, ty + 22);
  ctx.quadraticCurveTo(20, ty + 10 - Math.sin(f.bounceT) * 3, 14, ty - 12);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // Back leg
  drawLeg(ctx, 4 + hipShift, ty + 16, d2r(angles[6] + 5), d2r(angles[7] + 3), hitCol || '#0a0008', 6, 1);
  // Back arm
  drawArm(ctx, -4 - hipShift * 0.25, ty - 8, d2r(angles[2] - 6), d2r(angles[3] + 6), hitCol || '#0a0008',
          5, 15, 13, false, false);

  // TORSO
  ctx.save();
  ctx.translate(hipShift * 0.35, ty);
  ctx.rotate(torsoLean * 0.4 + hipTwist * 0.18);
  ctx.scale(1, squatAmt);
  ctx.fillStyle = hitCol || '#0a0008';
  ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.ellipse(0, 0, 10, 17, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // Front leg
  drawLeg(ctx, -4 + hipShift, ty + 16, d2r(angles[8]), d2r(angles[9]), hitCol || '#0a0010', 6, 1);

  // Front arm
  const isAtk = pose === 'windup' || pose === 'strike' || pose === 'hold';
  drawArm(ctx, 4 + hipShift * 0.25, ty - 8, d2r(angles[4]), d2r(angles[5]), hitCol || '#0a0008',
          5, 15, 13, isAtk, f.hit);

  // HEAD
  const headY = ty - 30 + breath * 0.4;
  ctx.save();
  ctx.translate(0, headY);
  ctx.rotate(torsoLean * 0.3 + (pose === 'hitstun' ? 0.3 : 0));

  ctx.fillStyle = hitCol || '#080005';
  ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Crown horns
  ctx.fillStyle = hitCol || '#1a0010';
  ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(-5, -18); ctx.lineTo(-2, -10); ctx.fill();
  ctx.beginPath(); ctx.moveTo(2, -10); ctx.lineTo(5, -18); ctx.lineTo(8, -10); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-3, -11); ctx.lineTo(0, -22); ctx.lineTo(3, -11); ctx.fill();

  // Eyes glow
  ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 18;
  ctx.fillStyle = '#ff0000';
  ctx.beginPath(); ctx.ellipse(-5, -2, 2.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(5, -2, 2.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff5555';
  ctx.beginPath(); ctx.arc(-5, -2, 1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(5, -2, 1, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Dark energy particles
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const px = Math.sin(f.bounceT * 1.5 + i * 1.57) * 18;
    const py = -14 + Math.cos(f.bounceT * 1.2 + i * 1.57) * 20;
    ctx.globalAlpha = 0.3 + Math.sin(f.bounceT + i) * 0.15;
    ctx.fillStyle = '#ff0000';
    ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(px, py, 1.5 + Math.sin(f.bounceT + i) * 0.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  ctx.restore(); // head
  ctx.restore(); // main
}

// ─── SHARED JOINT HELPERS ────────────────────────────────────────────────────

function drawLeg(ctx, ox, oy, thighAngle, kneeAngle, col, lw, squash) {
  const upperLen = 16 * (squash || 1);
  const lowerLen = 14 * (squash || 1);

  const kx = ox + Math.sin(thighAngle) * upperLen;
  const ky = oy + Math.cos(thighAngle) * upperLen;
  const fx = kx + Math.sin(thighAngle + kneeAngle) * lowerLen;
  const fy = ky + Math.cos(thighAngle + kneeAngle) * lowerLen;

  ctx.lineCap = 'round'; ctx.lineWidth = lw;
  ctx.strokeStyle = col;
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(kx, ky); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();

  // Foot
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(fx, fy, lw * 0.65, 0, Math.PI * 2); ctx.fill();
}

function drawArm(ctx, ox, oy, shoulderAngle, elbowAngle, col, lw, upperLen, lowerLen, isAtk, isHit) {
  const ex = ox + Math.sin(shoulderAngle) * upperLen;
  const ey = oy + Math.cos(shoulderAngle) * upperLen;
  const hx = ex + Math.sin(shoulderAngle + elbowAngle) * lowerLen;
  const hy = ey + Math.cos(shoulderAngle + elbowAngle) * lowerLen;

  ctx.lineCap = 'round'; ctx.lineWidth = lw;
  ctx.strokeStyle = col;
  if (isAtk) { ctx.shadowColor = '#ffe066'; ctx.shadowBlur = 6; }
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.shadowBlur = 0;

  // Fist
  ctx.fillStyle = isHit ? '#ff8888' : (isAtk ? '#fff' : col);
  if (isAtk) { ctx.shadowColor = '#ffe066'; ctx.shadowBlur = isAtk ? 10 : 0; }
  ctx.beginPath(); ctx.arc(hx, hy, lw * 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
}
