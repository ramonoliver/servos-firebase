# Central de Notificações Multicanal — Servos

Sistema centralizado para enviar avisos por **Push (FCM)**, **E-mail** e **WhatsApp (Evolution API)**.
Qualquer canal pode ser usado isolado ou em conjunto. Todo evento do sistema deve passar pela
camada central — nenhuma página/rota deve chamar um provedor diretamente.

## Arquitetura

```
src/services/
├── notification.service.ts   # camada central (notifyUser/notifyUsers/notifyChurch)
├── push.service.ts           # canal Push (Firebase Cloud Messaging)
├── email.service.ts          # canal E-mail (Resend + templates)
└── whatsapp.service.ts       # canal WhatsApp (Evolution API)

src/services/notification.types.ts   # tipos e defaults
src/lib/notifications/fcm-client.ts   # cliente Web Push (registro de token)
public/firebase-messaging-sw.js       # service worker do FCM
```

Fluxo do `notifyUser`:

1. Carrega o usuário (e-mail/telefone/nome).
2. Carrega as **preferências** (defaults se não houver).
3. Resolve os canais: interseção entre os pedidos, os habilitados e a **categoria** permitida.
4. **Deduplica** via `dedupeKey` (não reenvia se já houve envio com a mesma chave).
5. Despacha cada canal com **retry** (2 tentativas) e tratamento de erro.
6. Registra um **log** por canal na coleção `notifications`.

## Coleções Firestore

| Coleção (lógica)          | Firestore                | Conteúdo                                  |
| ------------------------- | ------------------------ | ----------------------------------------- |
| `notifications`           | `notifications`          | Log de cada envio (status/erro/dedupe)    |
| `notification_preferences`| `notificationPreferences`| Preferências por usuário (id = userId)    |
| `device_tokens`           | `deviceTokens`           | Tokens FCM por dispositivo                |

Os documentos seguem os tipos em `src/services/notification.types.ts`.

## Uso

```ts
import { notifyUser, notifyUsers, notifyChurch } from "@/services/notification.service";

await notifyUser({
  userId,
  churchId,
  channels: ["push", "email"],     // opcional; default = todos habilitados
  category: "schedule",            // respeita a preferência da categoria
  title: "Você foi escalado!",
  message: "Servir em Louvor no domingo às 18h.",
  content: {
    emailSubject: "Nova escala",
    emailHtml: "<p>...</p>",        // opcional; usa `message` se ausente
    whatsappText: "...",            // opcional
    clickUrl: "/escalas/123",       // abre ao clicar no push
  },
  dedupeKey: `schedule-assigned:${scheduleId}:${userId}`,
});
```

Categorias: `schedule`, `event`, `message`, `prayer`, `birthday`, `system` (sempre enviada).

## Como ligar os eventos

Cada evento deve chamar a camada central. Exemplos (a serem plugados nas rotas correspondentes):

| Evento                         | Chamada                                                                 |
| ------------------------------ | ----------------------------------------------------------------------- |
| Escala criada                  | `notifyUsers(memberIds, { category: "schedule", ... })`                 |
| Escala alterada/cancelada      | `notifyUsers(memberIds, { category: "schedule", ... })`                 |
| Lembrete de escala 24h         | cron diário → `notifyUsers(...)` com `dedupeKey` por dia                 |
| Evento criado                  | `notifyChurch(churchId, { category: "event", ... })`                    |
| Convite enviado                | já usa o e-mail; pode espelhar via `notifyUser({ channels:["email"] })` |
| Cadastro concluído             | **ligado** em `api/auth/complete-registration` (welcome)                |
| Nova mensagem                  | `notifyUsers(recipientIds, { category: "message", ... })`               |
| Novo acompanhamento/oração     | `notifyUser(responsibleId, { category: "prayer", ... })`                |
| Kids check-in/out              | `notifyUser(guardianId, { category: "system", ... })`                   |

> Já integrado como referência: **cadastro concluído** (`complete-registration`).
> Os demais seguem o mesmo padrão — basta importar e chamar `notify*` na rota do evento.

## Configuração por ambiente

```
# Push (FCM Web)
NEXT_PUBLIC_FIREBASE_VAPID_KEY=   # Console Firebase → Cloud Messaging → Web Push certificates

# WhatsApp (Evolution API)
EVOLUTION_API_URL=                # ex.: https://evo.suaempresa.com
EVOLUTION_API_KEY=                # apikey da instância
EVOLUTION_INSTANCE=               # nome da instância conectada

# E-mail (Resend — já configurado, domínio servosapp.com verificado)
RESEND_API_KEY=...
EMAIL_FROM="Servos <noreply@servosapp.com>"
```

Se as variáveis de um canal não estiverem definidas, esse canal é **"skipped"** (sem erro).

### Push (FCM)

1. Defina `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
2. No app: Configurações → Notificações → **Ativar push neste dispositivo**
   (solicita permissão, registra o service worker e salva o token em `deviceTokens`).
3. O envio em produção usa a conta de serviço do App Hosting (firebase-admin) — sem chave extra.

### WhatsApp (Evolution)

Endpoint usado: `POST {EVOLUTION_API_URL}/message/sendText/{EVOLUTION_INSTANCE}`
com header `apikey` e body `{ number, text }`. O número é normalizado para E.164 (Brasil).

## Preferências do usuário

Tela: **Configurações → Notificações** (`/configuracoes/notificacoes`).
Permite ligar/desligar canais (Push, E-mail, WhatsApp) e categorias
(Escalas, Eventos, Mensagens, Aniversários, Pedidos de oração).

API: `GET/POST /api/notifications/preferences`.
Registro de token: `POST /api/notifications/register-token`.

## Observação sobre e-mail (Resend vs Brevo)

O transporte de e-mail atual é o **Resend** (domínio `servosapp.com` verificado e funcionando).
Para migrar para Brevo SMTP, troque apenas a implementação de `sendRawEmail` em
`src/lib/email/send.ts` — a camada de notificações não muda.
