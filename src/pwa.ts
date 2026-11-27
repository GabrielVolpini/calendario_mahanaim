// =====================================================================
// APP INSTALÁVEL (PWA)
// - Registra o service worker (gerado pelo vite-plugin-pwa no build).
// - Mostra "Instalar app":
//     Android / Chrome / Edge: abre o pedido de instalação do navegador;
//     iPhone / iPad: abre o passo a passo "Adicionar à Tela de Início",
//     porque o iOS não tem pedido de instalação automático.
// - Avisa quando há versão nova e só recarrega quando a pessoa pedir.
// =====================================================================
import { registerSW } from 'virtual:pwa-register';
import { $, $$ } from './ui/dom';

/** Evento do Chrome/Edge que permite abrir o pedido de instalação. */
interface PedidoInstalacao extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const nav = navigator as Navigator & { standalone?: boolean };

const instalado = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;

// iPadOS se apresenta como Mac; o toque denuncia que é iPad.
const ehIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// No iOS só o Safari (e, a partir do iOS 16.4, Chrome/Edge pelo menu Compartilhar)
// oferecem "Adicionar à Tela de Início". Apps como Instagram/WhatsApp abrem um
// navegador interno que não oferece: aí pedimos para abrir no Safari.
const navegadorInternoIOS = ehIOS && /FBAN|FBAV|Instagram|Line\/|GSA\//.test(navigator.userAgent);

let pedido: PedidoInstalacao | null = null;

function mostrarBotoes(visivel: boolean): void {
  $$<HTMLElement>('[data-instalar]').forEach(b => { b.hidden = !visivel; });
}

async function instalar(): Promise<void> {
  if (pedido) {
    const p = pedido;
    pedido = null; // o navegador só aceita usar o pedido uma vez
    await p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === 'accepted') mostrarBotoes(false);
    return;
  }
  if (ehIOS) {
    $('#iosNota').hidden = !navegadorInternoIOS;
    $<HTMLDialogElement>('#iosDlg').showModal();
  }
}

function avisoDeAtualizacao(atualizar: () => Promise<void>): void {
  const barra = $('#atualizar');
  barra.hidden = false;
  $('#atualizarOk').onclick = () => { void atualizar(); };
  $('#atualizarX').onclick = () => { barra.hidden = true; };
}

export function iniciarPWA(): void {
  if (!('serviceWorker' in navigator)) return;

  const atualizar = registerSW({
    onNeedRefresh() { avisoDeAtualizacao(() => atualizar(true)); },
  });

  if (instalado()) return; // já está aberto como app: nada a oferecer

  $$<HTMLElement>('[data-instalar]').forEach(b => b.addEventListener('click', () => { void instalar(); }));

  // iOS: não há evento de instalação, o botão aparece direto com as instruções.
  if (ehIOS) mostrarBotoes(true);

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); // em vez da barrinha do navegador, usamos o nosso botão
    pedido = e as PedidoInstalacao;
    mostrarBotoes(true);
  });

  window.addEventListener('appinstalled', () => {
    pedido = null;
    mostrarBotoes(false);
  });
}
