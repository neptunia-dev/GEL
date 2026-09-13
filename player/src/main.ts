import { WebPlayer } from '../../engine/src/web/web-player';
import { GameState } from '../../engine/src/variables/game-state';
import '../../engine/src/web/web-player.css';
import './theme.css';

function illustration(kind: 'background' | 'alice'): string {
  const c = document.createElement('canvas'); c.width = 1600; c.height = 900; const x = c.getContext('2d')!;
  if (kind === 'background') {
    const sky = x.createLinearGradient(0, 0, 0, 900); sky.addColorStop(0, '#9bb7d6'); sky.addColorStop(.38, '#f4c0a4'); sky.addColorStop(.7, '#e49c8a'); sky.addColorStop(1, '#4d526c'); x.fillStyle = sky; x.fillRect(0, 0, 1600, 900);
    const sun = x.createRadialGradient(1030, 310, 20, 1030, 310, 520); sun.addColorStop(0, '#fff4d7'); sun.addColorStop(.35, '#ffc8a3aa'); sun.addColorStop(1, '#ff9e9600'); x.fillStyle = sun; x.fillRect(0, 0, 1600, 900);
    x.fillStyle = '#d99a8c'; x.fillRect(0, 535, 1600, 12); x.fillStyle = '#d4aa88'; x.fillRect(0, 547, 1600, 116); x.fillStyle = '#697d8a'; x.fillRect(0, 663, 1600, 237);
    x.fillStyle = '#f7e3c4'; x.fillRect(100, 165, 560, 380); x.fillStyle = '#7fa5ba'; x.fillRect(130, 195, 500, 320); x.strokeStyle = '#fff5d6'; x.lineWidth = 12; x.strokeRect(125, 190, 510, 330); x.strokeStyle = '#fff5d688'; x.lineWidth = 3; for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(130 + i * 125, 195); x.lineTo(130 + i * 125, 515); x.stroke(); } x.beginPath(); x.moveTo(130, 355); x.lineTo(630, 355); x.stroke();
    x.fillStyle = '#294a53'; x.fillRect(830, 280, 520, 280); x.strokeStyle = '#d5b28c'; x.lineWidth = 16; x.strokeRect(820, 270, 540, 300); x.fillStyle = '#e4d2a3'; x.font = '44px "Yu Mincho",serif'; x.fillText('桜通信', 1010, 395); x.font = '26px serif'; x.fillText('放課後 17:42', 1020, 435);
    x.fillStyle = '#d7b38b'; for (let i = 0; i < 6; i++) x.fillRect(145 + i * 230, 600 - (i % 2) * 18, 100, 58); x.fillStyle = '#4f5e68'; for (let i = 0; i < 6; i++) x.fillRect(165 + i * 230, 540 - (i % 2) * 18, 60, 45);
    for (let i = 0; i < 60; i++) { x.fillStyle = i % 3 ? '#f4c3c1bb' : '#fff4e4aa'; x.beginPath(); x.ellipse((i * 197) % 1600, 90 + (i * 83) % 500, 3 + i % 6, 2 + i % 4, i, 0, Math.PI * 2); x.fill(); }
    const haze = x.createLinearGradient(0, 0, 0, 900); haze.addColorStop(0, '#ffffff22'); haze.addColorStop(.62, '#ffffff00'); haze.addColorStop(1, '#24182d55'); x.fillStyle = haze; x.fillRect(0, 0, 1600, 900);
  } else {
    x.clearRect(0, 0, 1600, 900); x.save(); x.translate(800, 0);
    x.fillStyle = '#150e2038'; x.beginPath(); x.ellipse(0, 865, 245, 28, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#383050'; x.beginPath(); x.moveTo(-185, 890); x.bezierCurveTo(-160, 610, -125, 475, -95, 385); x.quadraticCurveTo(0, 335, 95, 385); x.bezierCurveTo(125, 475, 160, 610, 185, 890); x.closePath(); x.fill();
    x.fillStyle = '#596f9d'; x.beginPath(); x.moveTo(-125, 410); x.quadraticCurveTo(0, 460, 125, 410); x.lineTo(145, 890); x.lineTo(-145, 890); x.closePath(); x.fill();
    x.fillStyle = '#f3c8ae'; x.beginPath(); x.moveTo(-118, 455); x.quadraticCurveTo(0, 520, 118, 455); x.lineTo(95, 605); x.lineTo(-95, 605); x.closePath(); x.fill();
    x.fillStyle = '#fff7ec'; x.beginPath(); x.moveTo(-72, 450); x.lineTo(0, 535); x.lineTo(72, 450); x.quadraticCurveTo(0, 485, -72, 450); x.fill();
    x.fillStyle = '#e8a8b3'; x.beginPath(); x.moveTo(-35, 470); x.lineTo(35, 470); x.lineTo(52, 580); x.lineTo(0, 620); x.lineTo(-52, 580); x.closePath(); x.fill();
    x.fillStyle = '#f4cdb7'; x.beginPath(); x.ellipse(0, 230, 112, 122, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#f0bda8'; x.beginPath(); x.ellipse(-114, 245, 16, 35, 0, 0, Math.PI * 2); x.ellipse(114, 245, 16, 35, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#4b3a50'; x.beginPath(); x.ellipse(0, 165, 140, 120, 0, Math.PI * .96, Math.PI * 2.03); x.quadraticCurveTo(145, 155, 132, 330); x.quadraticCurveTo(120, 390, 98, 340); x.lineTo(82, 255); x.quadraticCurveTo(55, 185, -50, 180); x.quadraticCurveTo(-118, 195, -125, 310); x.quadraticCurveTo(-150, 190, -105, 105); x.quadraticCurveTo(-45, 25, 35, 62); x.quadraticCurveTo(105, 50, 145, 150); x.closePath(); x.fill();
    x.fillStyle = '#5b4560'; x.beginPath(); x.moveTo(-65, 80); x.quadraticCurveTo(-20, 35, 35, 62); x.quadraticCurveTo(-20, 75, -65, 80); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(-54, 244, 24, 30, 0, 0, Math.PI * 2); x.ellipse(54, 244, 24, 30, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#795a76'; x.beginPath(); x.ellipse(-54, 247, 12, 20, 0, 0, Math.PI * 2); x.ellipse(54, 247, 12, 20, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(-50, 239, 5, 0, Math.PI * 2); x.arc(58, 239, 5, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#4b3240'; x.lineWidth = 5; x.lineCap = 'round'; x.beginPath(); x.moveTo(-84, 215); x.quadraticCurveTo(-55, 198, -25, 215); x.moveTo(25, 215); x.quadraticCurveTo(55, 198, 84, 215); x.stroke();
    x.strokeStyle = '#9b5967'; x.lineWidth = 4; x.beginPath(); x.arc(0, 292, 26, .15, Math.PI - .15); x.stroke();
    x.strokeStyle = '#f3a0a0'; x.lineWidth = 8; x.beginPath(); x.arc(0, 147, 34, Math.PI * 1.15, Math.PI * 1.85); x.stroke();
    x.fillStyle = '#4b3a50'; x.beginPath(); x.moveTo(-95, 170); x.quadraticCurveTo(-180, 230, -135, 465); x.quadraticCurveTo(-110, 500, -95, 430); x.lineTo(-100, 245); x.closePath(); x.fill(); x.beginPath(); x.moveTo(95, 170); x.quadraticCurveTo(180, 230, 135, 465); x.quadraticCurveTo(110, 500, 95, 430); x.lineTo(100, 245); x.closePath(); x.fill();
    x.restore();
  }
  return c.toDataURL('image/png');
}

const result = document.querySelector<HTMLOutputElement>('#result')!;
try {
  const player = new WebPlayer({
    root: document.querySelector<HTMLElement>('#game')!, title: '桜通信 — Memories in Bloom',
    state: new GameState({ packageId: 'browser.qa', schemaVersion: 1, sceneId: 'chapter01.after_school', variables: [] }),
    characterIds: ['alice'], assets: { background: './assets/ai/background_classroom.png', alice: './assets/ai/character_alice.png' },
    source: `return function(ctx)
      ctx.stage:show("alice", { side = "left", expression = "smile" })
      ctx.stage:focus("alice")
      ctx.dialogue:say("alice", "ねえ……今日の夕焼け、少しだけ長い気がするの。")
      local answer = ctx.dialogue:choice({
        { id = "walk", text = "一緒に帰ろう" },
        { id = "later", text = "今日は部活があるんだ" }
      })
      ctx.stage:move("alice", "right")
      ctx.dialogue:say("alice", answer == "walk" and "ふふ、じゃあ桜道の方を通って帰ろう。" or "うん、また明日。桜が散る前に話そうね。")
      ctx.stage:hide("alice")
      return ctx.flow:end_story()
    end`,
    onComplete: () => { result.textContent = 'END — browser visual QA passed'; },
  });
  Object.assign(window, { qaPlayer: player }); player.start().catch(error => { result.textContent = `运行失败：${error.message}`; });
} catch (error) { result.textContent = `初始化失败：${(error as Error).message}`; }
