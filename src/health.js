// Spieler-Gesundheit: Herzen, Schaden mit i-Frames & Knockback, Regeneration,
// Brunnen-Heilung im Innenhof, Respawn bei 0 Herzen (ohne Fortschrittsverlust).

const TUNING = {
  maxHearts: 5,
  iFrames: 0.8,
  regenAmount: 0.5,
  regenInterval: 25,
  fountainPos: { x: 0, z: 12 }, // Innenhof-Brunnen (castle.js)
  // Der Brunnen hat einen physischen Blocker (Radius 3.6 + Spielerradius 0.45
  // ≈ 4.05m) — die Heilzone muss GRÖSSER sein, sonst schiebt die Kollision den
  // Spieler exakt aus der Reichweite heraus, bevor er je heilen kann.
  fountainRange: 5,
  fountainCooldown: 60,
  respawnPos: { x: 0, z: 30, yaw: Math.PI },
  whiteoutDur: 1.0,
};

export class HealthSystem {
  constructor(player, hud, fx, audio, maxHearts = TUNING.maxHearts) {
    this.player = player;
    this.hud = hud;
    this.fx = fx;
    this.audio = audio;
    this.maxHearts = maxHearts;
    this.hearts = maxHearts;
    this.iFrameT = 0;
    this.regenT = 0;
    this.fountainCooldownT = 0;
    this.dead = false;
    this.whiteoutT = 0;
    this.invincible = false; // Testkomfort (__game.gott())
    // main.js hängt hier die deutschen Toast-Texte ein (wie collectibles.onCollect)
    this.onRespawn = null;
    this.onFountainHeal = null;
  }

  damage(amount, knockDir) {
    if (this.invincible || this.dead || this.iFrameT > 0 || this.hearts <= 0) return;
    this.hearts = Math.max(0, this.hearts - amount);
    this.iFrameT = TUNING.iFrames;
    this.regenT = 0; // Regeneration-Timer resettet bei Treffer
    this.hud?.flashHurt();
    this.fx?.shake(0.2);
    this.audio?.hurt();
    if (knockDir) {
      this.player.vel.x += knockDir.x * 7;
      this.player.vel.y += (knockDir.y || 0) * 7 + 3;
      this.player.vel.z += knockDir.z * 7;
    }
    if (this.hearts <= 0) {
      this.dead = true;
      this.whiteoutT = TUNING.whiteoutDur;
    }
  }

  update(dt) {
    if (this.iFrameT > 0) this.iFrameT -= dt;

    if (this.dead) {
      this.whiteoutT -= dt;
      this.hud?.setWhiteout(Math.max(0, this.whiteoutT) / TUNING.whiteoutDur);
      if (this.whiteoutT <= 0) {
        this.player.teleport(TUNING.respawnPos.x, TUNING.respawnPos.z, TUNING.respawnPos.yaw);
        this.hearts = this.maxHearts;
        this.dead = false;
        this.iFrameT = TUNING.iFrames;
        this.onRespawn?.();
      }
      return;
    }

    // Regeneration ohne Treffer
    if (this.hearts < this.maxHearts) {
      this.regenT += dt;
      if (this.regenT >= TUNING.regenInterval) {
        this.regenT = 0;
        this.hearts = Math.min(this.maxHearts, this.hearts + TUNING.regenAmount);
      }
    }

    // Brunnen-Heilung (max. 1x/Minute, nur wenn tatsächlich geheilt wird)
    if (this.fountainCooldownT > 0) this.fountainCooldownT -= dt;
    if (this.fountainCooldownT <= 0 && this.hearts < this.maxHearts) {
      const dx = this.player.pos.x - TUNING.fountainPos.x;
      const dz = this.player.pos.z - TUNING.fountainPos.z;
      if (dx * dx + dz * dz < TUNING.fountainRange * TUNING.fountainRange) {
        this.hearts = this.maxHearts;
        this.fountainCooldownT = TUNING.fountainCooldown;
        this.fx?.burst(this.player.pos, 0x9fe0ff, 20, 3, { gravity: -2, life: 0.9 });
        this.onFountainHeal?.();
      }
    }
  }
}
