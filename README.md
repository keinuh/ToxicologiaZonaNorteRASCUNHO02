# Toxicologia Zona Norte – Site + Backend

Site institucional (HTML/CSS/JS puro, sem bibliotecas externas) com backend Node/Express.

## Rodar localmente
```bash
npm install
cp .env.example .env     # preencha os valores
npm run dev              # http://localhost:3000
```

## Antes de publicar
1. No `.env`, defina `NODE_ENV=production`, `SITE_ORIGIN` (seu domínio) e gere `ADMIN_TOKEN` e `IP_SALT`:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Troque `https://www.seudominio.com.br` pelo seu domínio em `public/index.html`, `robots.txt` e `sitemap.xml`.
3. Publique atrás de HTTPS (Render, Railway, VPS com Nginx + Let's Encrypt, etc.).

## Ver os contatos recebidos
```bash
curl -H "Authorization: Bearer SEU_ADMIN_TOKEN" https://seudominio.com.br/api/admin/contatos
```
Os contatos ficam em `data/contatos.jsonl` (fora da pasta pública). Faça backup periódico.
> Em hospedagens com disco efêmero (ex.: planos gratuitos do Render/Heroku), configure um disco persistente
> ou troque o armazenamento por um banco de dados.

## Segurança aplicada
- CSP estrita (sem scripts/estilos inline), HSTS, X-Frame-Options/`frame-ancestors`, Referrer-Policy, Permissions-Policy (Helmet)
- Rate limit na API e limite mais rígido no formulário e na rota administrativa
- Validação e sanitização no servidor; limite de 10 KB por requisição
- Honeypot + tempo mínimo de preenchimento contra robôs
- IP guardado apenas como hash (HMAC com sal secreto) – LGPD
- E-mail e WhatsApp entregues pelo backend via variáveis de ambiente
- Rota administrativa protegida por token com comparação em tempo constante e resposta 404 para não autorizados
- Erros genéricos ao navegador; nenhum dado de usuário é escrito em `console`/logs
- `.env` e `data/` no `.gitignore`

## Observação importante
Tudo que o navegador recebe (HTML, CSS, JS, telefone e e-mail exibidos) é público por natureza.
Segredos reais (tokens, chaves, senhas) ficam **somente** no `.env` do servidor.
