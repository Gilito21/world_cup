import { loadStripe } from '@stripe/stripe-js'

const pk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY

// Carga perezosa: una sola promesa compartida en toda la app.
// Si no hay key configurada devolvemos null y los componentes que
// dependen de Stripe muestran un fallback.
export const stripePromise = pk ? loadStripe(pk) : null

// Precio fijo del producto. Si cambia, actualizar también el edge
// function "create-league-payment" para que coincida con Stripe.
export const LEAGUE_PRICE_CENTS = 799
export const LEAGUE_PRICE_LABEL = '€7,99'
