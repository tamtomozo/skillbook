import './style.css';
import { Game } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;

const game = new Game(canvas, ui);
window.addEventListener('resize', () => game.resize(window.innerWidth, window.innerHeight));

// 開発中のみ、ブラウザのコンソールから game を触れるようにする
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
