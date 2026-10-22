(() => {
  'use strict';
  document.documentElement.classList.add('js');

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  /* Menu mobile */
  const burger = $('#burger');
  const nav = $('#menu');
  if (burger && nav) {
    burger.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      burger.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', (e) => {
      if (e.target.closest('a')) {
        nav.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* Animações de entrada */
  const items = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    items.forEach((el) => io.observe(el));
  } else {
    items.forEach((el) => el.classList.add('in'));
  }

  const ano = $('#ano');
  if (ano) ano.textContent = new Date().getFullYear();

  /* Dados de contato vindos do backend (não ficam no HTML) */
  let contact = { email: '', whatsapp: '' };
  const waUrl = (text) =>
    contact.whatsapp ? `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(text)}` : '#contato';

  const applyContact = () => {
    $$('[data-wa]').forEach((a) => {
      const custom = a.getAttribute('href');

      // Se o link já tem um endereço próprio (ex.: wa.link), mantém e só abre em nova aba
      if (custom && !custom.startsWith('#')) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        return;
      }

      a.href = waUrl(a.dataset.wa);
      if (contact.whatsapp) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
    });

    const mail = $('#mail');
    const mailTxt = $('#mailtxt');
    if (mail && contact.email) {
      mail.href = `mailto:${contact.email}`;
      mailTxt.textContent = contact.email;
    } else if (mailTxt) {
      mailTxt.textContent = 'Use o formulário';
    }
  };

  fetch('/api/contato-info', { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((d) => {
      contact = { email: String(d.email || ''), whatsapp: String(d.whatsapp || '').replace(/\D/g, '') };
    })
    .catch(() => {})
    .finally(applyContact);

  /* Formulário */
  const form = $('#form');
  if (!form) return;
  const msg = $('#msg');
  const btn = $('#enviar');
  const started = Date.now();

  const tel = $('#telefone');
  tel.addEventListener('input', () => {
    let d = tel.value.replace(/\D/g, '').slice(0, 11);
    if (d.length > 6) d = d.replace(/^(\d{2})(\d{4,5})(\d{0,4}).*/, '($1) $2-$3');
    else if (d.length > 2) d = d.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
    else if (d.length) d = `(${d}`;
    tel.value = d.replace(/-$/, '');
  });

  const setErr = (name, text) => {
    const el = $(`.err[data-for="${name}"]`, form);
    if (el) el.textContent = text || '';
    const f = form.elements[name];
    if (f && f.closest('.field')) f.closest('.field').classList.toggle('invalid', Boolean(text));
  };

  const validate = () => {
    let ok = true;
    const v = {
      nome: form.nome.value.trim(),
      telefone: form.telefone.value.replace(/\D/g, ''),
      servico: form.servico.value,
      consentimento: form.consentimento.checked
    };
    setErr('nome', v.nome.length < 3 ? 'Informe seu nome.' : '');
    setErr('telefone', v.telefone.length < 10 ? 'Informe um telefone com DDD.' : '');
    setErr('servico', !v.servico ? 'Escolha uma opção.' : '');
    setErr('consentimento', !v.consentimento ? 'Necessário concordar para enviar.' : '');
    ['nome', 'telefone', 'servico', 'consentimento'].forEach((k) => {
      if ((k === 'nome' && v.nome.length < 3) || (k === 'telefone' && v.telefone.length < 10) || (k === 'servico' && !v.servico) || (k === 'consentimento' && !v.consentimento)) ok = false;
    });
    return ok;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'form__msg';
    msg.textContent = '';
    if (!validate()) return;

    btn.disabled = true;
    btn.textContent = 'Enviando…';
    try {
      const res = await fetch('/api/contato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          nome: form.nome.value,
          telefone: form.telefone.value,
          servico: form.servico.value,
          mensagem: form.mensagem.value,
          website: form.website.value,
          consentimento: form.consentimento.checked,
          t: Date.now() - started
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        msg.classList.add('ok');
        msg.textContent = data.message || 'Recebemos seu contato!';
        form.reset();
      } else if (res.status === 422 && data.erros) {
        Object.entries(data.erros).forEach(([k, t]) => setErr(k, t));
      } else {
        msg.classList.add('bad');
        msg.textContent = data.message || 'Não foi possível enviar agora.';
      }
    } catch {
      msg.classList.add('bad');
      msg.textContent = 'Sem conexão. Tente novamente ou chame no WhatsApp.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enviar';
    }
  });
})();
