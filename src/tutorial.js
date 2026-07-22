// Kontext-Hinweise statt Toast-Spam (Sonnet-5-Polish, Meilenstein C2).
// Jeder einmalige Hinweis läuft über save.tutorial.seen (persistiert, siehe
// save.js/A2) — nach einem Reload wird nichts wiederholt. Zwei Hinweise sind
// bewusst NICHT einmalig, sondern per Cooldown wiederholbar (Heiltipp bei
// niedrigem Leben, sanfter Reminder aus dem Objective Resolver), weil sie
// über eine ganze Spielsitzung hinweg mehrfach nützlich sein können.
//
// Alle Hinweise laufen über hud.showToast(text, seconds, 0) — Priorität 0
// (niedrigste Stufe, siehe hud.js). Jeder bestehende showToast()-Aufruf ohne
// dritten Parameter bleibt Priorität 1 und überschreibt einen noch
// sichtbaren Tutorial-Hinweis automatisch; ein Tutorial-Hinweis überschreibt
// umgekehrt NIE einen noch sichtbaren wichtigeren Toast (Plan C2: "Hinweise
// ... überlagern wichtige Gameplay-Meldungen nicht").
import { resolveProgress } from './progress.js';

const SPELL_TARGET_RADIUS = 20;
const NEXT_HINT_IDLE_SECONDS = 90;
const NEXT_HINT_COOLDOWN_SECONDS = 180;
const LOW_HEALTH_COOLDOWN_SECONDS = 60;

export function buildTutorial(hud, save, deps) {
  const { interact, creatures, health, marauders } = deps;

  let idleTimer = 0;
  let lastPrimaryKey = null;
  let nextHintCooldown = 0;
  let lowHealthCooldown = 0;

  function seen(id) { return save.tutorial.seen.includes(id); }
  // Markiert NUR als gesehen, wenn der Toast auch wirklich sichtbar wurde —
  // showToast() gibt false zurück, wenn gerade ein wichtigerer Toast läuft
  // (siehe hud.js). Ohne diese Prüfung könnte ein Hinweis als "gesehen"
  // gelten, obwohl der Spieler ihn nie zu Gesicht bekommen hat.
  function showOnce(id, text, seconds = 4.5) {
    if (seen(id)) return false;
    if (!hud.showToast(text, seconds, 0)) return false;
    save.tutorial.seen.push(id);
    return true;
  }

  return {
    // Vom "Spiel starten"-Handler in main.js aufgerufen (nicht vom eigenen
    // update(), da dieser Hinweis EINMALIG beim allerersten echten Start
    // ausgelöst wird, nicht erst wenn eine Bedingung im nächsten Frame
    // zutrifft).
    onStart() {
      showOnce('start', 'Sieh dich um und folge dem goldenen Hinweis.', 4.5);
    },
    // Reset-Handler: save.tutorial.seen wird dort geleert (Object.assign) —
    // die reinen Timer/Cooldowns hier leben nur im Arbeitsspeicher und
    // müssen zusätzlich zurückgesetzt werden, sonst bliebe z.B. ein bereits
    // abgelaufener idleTimer nach einem Reset unverändert bestehen.
    restore() {
      idleTimer = 0;
      lastPrimaryKey = null;
      nextHintCooldown = 0;
      lowHealthCooldown = 0;
    },
    update(dt, playerPos) {
      // Regel: "Ein Hinweis darf den Spieler nicht beim Zielen, Dialog oder
      // Kampf blockieren" — während Dialog/Karte läuft ohnehin main.js'
      // Eingabesperre; hier zusätzlich: keine NEUEN Hinweise anstoßen.
      if (hud.dialogOpen || marauders.isOpen) return;

      // Reihenfolge = Priorität unter den einmaligen Hinweisen. Sobald einer
      // gezeigt wurde, sofort raus (Plan: "maximal ein erklärender Hinweis
      // gleichzeitig").
      if (!seen('interact') && interact.current) {
        if (showOnce('interact', 'Drücke E, um zu interagieren.')) return;
      }
      if (!seen('spell_target')) {
        const nearTarget = creatures.list.some((c) => {
          if (!c.alive) return false;
          const dx = c.pos.x - playerPos.x, dz = c.pos.z - playerPos.z;
          return dx * dx + dz * dz < SPELL_TARGET_RADIUS * SPELL_TARGET_RADIUS;
        });
        if (nearTarget && showOnce('spell_target', 'Zauber mit Mausrad oder 1-9 wählen, dann per Linksklick wirken.')) return;
      }
      if (!seen('map') && save.collected.length > 0) {
        if (showOnce('map', 'Dein erster Fund! Drücke J für die Karte des Rumtreibers & deine Aufgaben.')) return;
      }

      // Heiltipp bei niedrigem Leben — wiederholbar (Cooldown statt seen()),
      // da niedriges Leben mehrfach pro Sitzung vorkommen kann. Brunnen +
      // Gasthaus-Kamin sind von Anfang an nutzbar (kein Freischalt-Gate).
      lowHealthCooldown = Math.max(0, lowHealthCooldown - dt);
      if (health && health.hearts <= 1 && lowHealthCooldown <= 0) {
        hud.showToast('Niedriges Leben! Der Brunnen im Innenhof oder das Gasthaus in Eulenbrück heilen dich.', 4, 0);
        lowHealthCooldown = LOW_HEALTH_COOLDOWN_SECONDS;
        return;
      }

      // Sanfter Reminder aus dem Objective Resolver — wiederholbar, mit
      // Cooldown, nur wenn sich das Hauptziel längere Zeit nicht verändert
      // hat (kein Fortschritt trotz aktivem Hauptziel).
      const progress = resolveProgress(save);
      const key = `${progress.primary.id}|${progress.primary.description}`;
      if (key !== lastPrimaryKey) { lastPrimaryKey = key; idleTimer = 0; }
      else idleTimer += dt;
      nextHintCooldown = Math.max(0, nextHintCooldown - dt);
      if (!progress.primary.completed && idleTimer >= NEXT_HINT_IDLE_SECONDS && nextHintCooldown <= 0) {
        hud.showToast(progress.nextHint, 4, 0);
        nextHintCooldown = NEXT_HINT_COOLDOWN_SECONDS;
        idleTimer = 0;
      }
    },
  };
}
