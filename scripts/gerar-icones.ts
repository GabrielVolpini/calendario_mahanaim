// =====================================================================
// Gera os ícones do app instalável (PWA) a partir de public/logo-mahanaim.jpg.
//
//   node scripts/gerar-icones.ts
//
// O logo é um círculo com cantos pretos. Aqui ele é recortado em círculo e
// colocado sobre o azul da marca, para os cantos não aparecerem pretos
// no ícone do celular. Os arquivos saem em public/icons/.
// =====================================================================
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const ORIGEM = 'public/logo-mahanaim.jpg';
const DESTINO = 'public/icons';
const AZUL = '#0B1650';

/** Logo recortado em círculo, com `lado` px. */
async function logoRedondo(lado: number): Promise<Buffer> {
  const mascara = Buffer.from(
    `<svg width="${lado}" height="${lado}"><circle cx="${lado / 2}" cy="${lado / 2}" r="${lado / 2}" fill="#fff"/></svg>`,
  );
  return sharp(ORIGEM)
    .resize(lado, lado, { kernel: 'lanczos3' })
    .composite([{ input: mascara, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/**
 * Ícone quadrado de `tamanho` px, fundo azul, com o logo ocupando `escala`
 * do lado. Ícones "maskable" (Android) precisam de folga: o sistema corta
 * as bordas em círculo ou gota, então o logo fica dentro dos 80% centrais.
 */
async function icone(arquivo: string, tamanho: number, escala: number): Promise<void> {
  const lado = Math.round(tamanho * escala);
  const logo = await logoRedondo(lado);
  await sharp({ create: { width: tamanho, height: tamanho, channels: 4, background: AZUL } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(`${DESTINO}/${arquivo}`);
  console.log(`${DESTINO}/${arquivo}`);
}

await mkdir(DESTINO, { recursive: true });
await icone('icon-192.png', 192, 0.94);
await icone('icon-512.png', 512, 0.94);
await icone('maskable-512.png', 512, 0.72);
await icone('apple-touch-icon.png', 180, 0.86); // iOS arredonda os cantos sozinho
await icone('favicon-32.png', 32, 1);
