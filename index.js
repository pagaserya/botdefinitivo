const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const OPERADOR_NUMERO = '1128491501'; // sin prefijo
const OPERADOR_JID = `549${OPERADOR_NUMERO}@c.us`;
const clientes = new Map();

function limpiarNumero(jid) {
  return jid.replace('@c.us','').replace(/^549/, '');
}

function enviarInactividad(cliente) {
  const numero = cliente.jid;
  const limpio = limpiarNumero(numero);
  client.sendMessage(numero, `📲 Si no entendés cómo continuar con el bot, no te preocupes.
Podés escribir directamente a nuestro operador para recibir atención personalizada.
Este es su número: *+54 9 11 2849‑1501*

(Si ya solucionaste todo, podés ignorar este mensaje)`);
  client.sendMessage(OPERADOR_JID, `⚠️ El cliente *${limpio}* lleva más de 30 minutos sin responder y todavía no fue derivado.`);
  cliente.derivado = true;
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] }
});

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log('Escaneá el QR para conectar');
});

client.on('ready', () => {
  console.log('✅ Bot conectado y listo');
});

client.on('message', async msg => {
  const jid = msg.from;
  // ignore groups
  if (jid.includes('@g.us')) return;

  let cliente = clientes.get(jid);
  if (!cliente) {
    cliente = { jid, etapa: 0, datos: [], derivado: false, timer: null };
    clientes.set(jid, cliente);
  }

  // reset inactivity timer
  clearTimeout(cliente.timer);
  cliente.timer = setTimeout(() => {
    if (!cliente.derivado) enviarInactividad(cliente);
  }, 30*60*1000);

  const texto = msg.body?.trim();

  // Step 1: welcome once
  if (cliente.etapa === 0) {
    await client.sendMessage(jid, `🧾 *¡Hola! Bienvenido al servicio de pago de boletas al 50%*
Podés pagar luz, agua, gas, multas, impuestos y mucho más.
👇 Escribí “quiero pagar” para continuar.`);
    cliente.etapa = 1;
    return;
  }

  // detect intent to pay
  if (cliente.etapa === 1 && /pagar|boleta|factura/.test(texto.toLowerCase())) {
    cliente.etapa = 2;
    await client.sendMessage(jid, `✅ Genial. ¿Qué servicio necesitas pagar?
Por ejemplo: luz, agua, gas, multas, teléfono, etc.`);
    return;
  }

  // service response
  if (cliente.etapa === 2) {
    cliente.datos.push(`Servicio: ${texto}`);
    cliente.etapa = 3;
    await client.sendMessage(jid, `📸 Perfecto. Ahora por favor mandanos:
- Foto clara de la boleta
- Tu nombre completo
- Foto del frente de tu DNI`);
    return;
  }

  // negative response case
  if (cliente.etapa === 3 && (/no tengo|no puedo/.test(texto.toLowerCase()))) {
    cliente.derivado = true;
    await client.sendMessage(jid, `📞 *No hay problema. Si necesitás ayuda, podés escribir directamente al operador:*\n👉 +54 9 11 2849‑1501`);
    const limpio = limpiarNumero(jid);
    await client.sendMessage(OPERADOR_JID, `📩 Cliente *${limpio}* indicó que no tiene boleta o DNI a mano. Mensaje: ${texto}`);
    return;
  }

  // collect media and text
  if (cliente.etapa === 3) {
    if (msg.hasMedia) {
      const media = await msg.downloadMedia();
      if (!cliente.boleta) {
        cliente.boleta = media;
        await client.sendMessage(jid, '📎 Boleta recibida.');
      } else if (!cliente.dni) {
        cliente.dni = media;
        await client.sendMessage(jid, '🪪 DNI recibido.');
      }
    } else {
      cliente.nombre = texto;
      await client.sendMessage(jid, '🧍 Nombre recibido.');
    }

    // if all data received
    if (cliente.boleta && cliente.dni && cliente.nombre) {
      cliente.derivado = true;
      await client.sendMessage(jid, `✅ *Perfecto. Ya recibimos todos tus datos.*\nEn breve te vamos a estar escribiendo.\n💸 *No es necesario realizar ningún pago previo.*`);
      await client.sendMessage(jid, `📞 *Si necesitás hablar con un operador, podés escribir a este número:*\n👉 +54 9 11 2849‑1501`);
      const limpio = limpiarNumero(jid);
      await client.sendMessage(OPERADOR_JID, `📬 Nuevo cliente interesado en pagar boleta al 50%:\n\n📱 Número: ${limpio}\n📄 Servicio: ${cliente.datos[0].split(': ')[1]}\n🧍 Nombre: ${cliente.nombre}`);
      await client.sendMessage(OPERADOR_JID, cliente.boleta, { caption: '📎 Boleta' });
      await client.sendMessage(OPERADOR_JID, cliente.dni, { caption: '🪪 DNI' });
    }
    return;
  }
});
client.initialize();