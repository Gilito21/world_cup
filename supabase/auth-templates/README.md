# Plantillas de Supabase Auth

Generadas con `node scripts/build-auth-templates.js` a partir del shell
editorial compartido en `scripts/_brand-email.js`.

**No editar a mano** — vuelve a ejecutar el build tras cambiar el helper.

## Cómo aplicarlas

1. Supabase Dashboard → Authentication → Email Templates
2. Por cada plantilla:
   - **Confirm signup** ← `confirm-signup.html`
   - **Magic Link** ← `magic-link.html`
   - **Change Email Address** ← `email-change.html`
   - **Reset Password** ← `recovery.html`
   - **Invite user** ← `invite.html`
3. Pega el HTML completo en el campo "Message (HTML)".
4. Pega el subject correspondiente en "Message subject" (ver lista abajo).
5. Guarda.

## Subjects

| Plantilla            | Subject                                              |
| -------------------- | ---------------------------------------------------- |
| Confirm signup       | Confirma tu email · Porra de Empresas                |
| Magic Link           | Tu enlace para entrar · Porra de Empresas            |
| Reset Password       | Restablece tu contraseña · Porra de Empresas         |
| Change Email Address | Confirma tu nuevo email · Porra de Empresas          |
| Invite user          | Te han invitado · Porra de Empresas                  |

## Variables Go-templates usadas

- `{{ .ConfirmationURL }}` — URL firmada al endpoint correspondiente
- `{{ .NewEmail }}` — solo en email-change

Resto de variables disponibles (no usadas aquí): `{{ .Email }}`,
`{{ .Token }}`, `{{ .TokenHash }}`, `{{ .SiteURL }}`, `{{ .RedirectTo }}`.
