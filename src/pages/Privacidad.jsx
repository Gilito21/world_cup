import { Link } from 'react-router-dom'

export default function Privacidad() {
  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-paper border-b border-ink/20">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-ink">
            <span>⚽</span>
            <span>Porra <span className="text-terracotta">Mundial 2026</span></span>
          </Link>
          <Link to="/auth" className="text-sm text-ink/60 hover:text-ink transition-colors">
            Iniciar sesión
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-12">
        <h1 className="text-3xl font-bold text-ink mb-2">Política de Privacidad</h1>
        <p className="text-ink/50 text-sm mb-10">Última actualización: mayo de 2026</p>

        <div className="space-y-8 text-ink/80 leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-ink mb-3">1. Responsable del tratamiento</h2>
            <p>
              El responsable del tratamiento de los datos personales recogidos en esta aplicación es <strong>Porra de Empresas</strong>,
              con dirección de contacto en <a href="mailto:porra@porradeempresas.com" className="text-terracotta-600 hover:underline">porra@porradeempresas.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-3">2. Datos que recogemos</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Dirección de email</strong> — para identificar tu cuenta y enviarte comunicaciones relacionadas con la porra.</li>
              <li><strong>Nombre de usuario</strong> — público dentro de la aplicación para mostrar clasificaciones.</li>
              <li><strong>Empresa</strong> (opcional) — para mostrar rankings por empresa.</li>
              <li><strong>Pronósticos y predicciones</strong> — el contenido que introduces al usar la app.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-3">3. Finalidad y base legal</h2>
            <p className="mb-3">Usamos tus datos exclusivamente para:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Gestionar tu cuenta y permitirte participar en la porra del Mundial 2026.</li>
              <li>Mostrar clasificaciones y resultados dentro de la aplicación.</li>
              <li>Enviarte recordatorios relacionados con el torneo (si lo has solicitado).</li>
              <li>Procesar pagos para la creación de ligas privadas (gestionado por Stripe).</li>
            </ul>
            <p className="mt-3">La base legal es la <strong>ejecución del servicio</strong> solicitado por el usuario (Art. 6.1.b RGPD).</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-3">4. Proveedores de servicio</h2>
            <p>
              Para el funcionamiento de la aplicación contamos con proveedores externos de confianza
              que pueden acceder a tus datos únicamente en la medida necesaria para prestar sus servicios
              (autenticación, alojamiento, envío de emails y procesamiento de pagos).
              Todos ellos están sujetos a acuerdos de confidencialidad y cumplen con el RGPD.
              No almacenamos datos de tarjetas de crédito.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-3">5. Conservación de datos</h2>
            <p>
              Tus datos se conservarán mientras mantengas una cuenta activa o hasta que solicites su eliminación.
              Tras el fin del Mundial 2026, podemos conservar los datos anonimizados con fines estadísticos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-3">6. Tus derechos</h2>
            <p className="mb-3">Tienes derecho a:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Acceder</strong> a los datos que tenemos sobre ti.</li>
              <li><strong>Rectificar</strong> datos incorrectos.</li>
              <li><strong>Eliminar</strong> tu cuenta y todos tus datos.</li>
              <li><strong>Oponerte</strong> al tratamiento o solicitar su limitación.</li>
              <li><strong>Portabilidad</strong> de tus datos en formato legible.</li>
            </ul>
            <p className="mt-3">
              Para ejercer cualquiera de estos derechos, escríbenos a{' '}
              <a href="mailto:porra@porradeempresas.com" className="text-terracotta-600 hover:underline">porra@porradeempresas.com</a>.
              Responderemos en un plazo máximo de 30 días.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-3">7. Cookies</h2>
            <p>
              Esta aplicación utiliza únicamente cookies técnicas necesarias para el funcionamiento del servicio
              (sesión de usuario). No utilizamos cookies de seguimiento ni publicidad.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-3">8. Contacto</h2>
            <p>
              Para cualquier consulta sobre privacidad, puedes contactarnos en{' '}
              <a href="mailto:porra@porradeempresas.com" className="text-terracotta-600 hover:underline">porra@porradeempresas.com</a>.
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-ink/20 mt-16">
        <div className="max-w-3xl mx-auto px-5 py-6 text-center text-sm text-ink/50">
          © 2026 Porra Mundial · BlueBull Partners
        </div>
      </footer>
    </div>
  )
}
