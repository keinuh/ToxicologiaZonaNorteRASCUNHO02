'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'contatos.jsonl');
const PUBLIC_DIR = path.join(__dirname, 'public');

const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';
const CONTACT_WHATSAPP = process.env.CONTACT_WHATSAPP || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const IP_SALT = process.env.IP_SALT || crypto.randomBytes(16).toString('hex');
const SITE_ORIGIN = (process.env.SITE_ORIGIN || '').replace(/\/$/, '');

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

/* ---------- Segurança de cabeçalhos (CSP estrita, sem inline) ---------- */
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'frame-src': ['https://www.google.com'],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        ...(isProd ? { 'upgrade-insecure-requests': [] } : {})
      }
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: isProd ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false
  })
);
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  next();
});

app.use(compression());
app.use(express.json({ limit: '10kb' }));

/* ---------- Estáticos com cache ---------- */
app.use(
  express.static(PUBLIC_DIR, {
    extensions: ['html'],
    index: 'index.html',
    dotfiles: 'ignore',
    maxAge: isProd ? '7d' : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    }
  })
);

/* ---------- Utilidades ---------- */
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Muitas tentativas. Tente novamente em alguns minutos ou chame no WhatsApp.' }
});
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

const clean = (v, max) =>
  String(v ?? '')
    .replace(/[\u0000-\u001F\u007F<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const hashIp = (ip) => crypto.createHmac('sha256', IP_SALT).update(String(ip)).digest('hex').slice(0, 24);

const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

const originAllowed = (req) => {
  const origin = req.get('origin');
  if (!origin) return true; // mesma origem sem cabeçalho
  if (!isProd || !SITE_ORIGIN) return true;
  const allowed = [SITE_ORIGIN, SITE_ORIGIN.replace('://www.', '://')];
  return allowed.includes(origin);
};

/* ---------- API ---------- */
app.use('/api', apiLimiter);

// Dados de contato vêm do servidor (variáveis de ambiente), não ficam no HTML.
app.get('/api/contato-info', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ email: CONTACT_EMAIL, whatsapp: CONTACT_WHATSAPP });
});

app.post('/api/contato', formLimiter, async (req, res) => {
  try {
    if (!originAllowed(req) || !req.is('application/json')) {
      return res.status(403).json({ ok: false, message: 'Requisição não permitida.' });
    }

    const body = req.body || {};

    // Honeypot e tempo mínimo de preenchimento (anti-robô)
    const elapsed = Number(body.t) || 0;
    if (body.website || elapsed < 3000) {
      return res.json({ ok: true, message: 'Mensagem recebida.' }); // resposta neutra para o robô
    }

    const nome = clean(body.nome, 80);
    const telefone = String(body.telefone ?? '').replace(/\D/g, '');
    const servico = clean(body.servico, 40);
    const mensagem = clean(body.mensagem, 500);
    const consentimento = body.consentimento === true;

    const servicosValidos = ['CNH – Renovação', 'CNH – 1ª habilitação / adição de categoria', 'DETRAN', 'Outro / dúvida'];
    const erros = {};
    if (nome.length < 3) erros.nome = 'Informe seu nome.';
    if (telefone.length < 10 || telefone.length > 11) erros.telefone = 'Informe um telefone com DDD.';
    if (!servicosValidos.includes(servico)) erros.servico = 'Escolha uma opção.';
    if (!consentimento) erros.consentimento = 'É necessário concordar com a política de privacidade.';

    if (Object.keys(erros).length) {
      return res.status(422).json({ ok: false, message: 'Verifique os campos.', erros });
    }

    const registro = {
      id: crypto.randomUUID(),
      data: new Date().toISOString(),
      nome,
      telefone,
      servico,
      mensagem,
      ip_hash: hashIp(req.ip)
    };

    await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
    await fs.appendFile(LEADS_FILE, JSON.stringify(registro) + '\n', { mode: 0o600 });

    return res.json({ ok: true, message: 'Recebemos seu contato! Responderemos em breve.' });
  } catch {
    // Nunca devolve detalhes internos ao navegador
    return res.status(500).json({ ok: false, message: 'Não foi possível enviar agora. Fale conosco pelo WhatsApp.' });
  }
});

// Consulta dos contatos (somente com token). Ex.: curl -H "Authorization: Bearer SEU_TOKEN" https://site/api/admin/contatos
app.get('/api/admin/contatos', adminLimiter, async (req, res) => {
  const auth = req.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!ADMIN_TOKEN || ADMIN_TOKEN.length < 32 || !token || !safeEqual(token, ADMIN_TOKEN)) {
    return res.status(404).json({ ok: false }); // 404 para não revelar a existência da rota
  }
  try {
    const raw = await fs.readFile(LEADS_FILE, 'utf8').catch(() => '');
    const lista = raw
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .reverse();
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, total: lista.length, contatos: lista });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

app.use('/api', (req, res) => res.status(404).json({ ok: false }));

/* ---------- 404 e erros ---------- */
app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ ok: false, message: 'Requisição inválida.' });
  res.status(500).json({ ok: false, message: 'Erro interno.' });
});

app.listen(PORT, () => {
  if (!isProd) console.log(`Servidor em http://localhost:${PORT}`);
});
