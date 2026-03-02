/* eslint-disable @typescript-eslint/no-explicit-any */
import { FC, ReactElement, useEffect, useState } from 'react'
import { Check, CreditCard } from 'lucide-react'
import { motion } from 'framer-motion'
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '')

const CardPaymentForm: FC<{ planId: string; billingCycle: string; onSuccess: () => void }> = ({ planId, billingCycle, onSuccess }) => {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const getToken = () => {
    let tokenStr = localStorage.getItem('token')
    if (!tokenStr) return null
    try {
      const parsed = JSON.parse(tokenStr)
      return typeof parsed === 'string' ? parsed : tokenStr
    } catch {
      return tokenStr
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)
    setError('')

    try {
      const cardElement = elements.getElement(CardElement)
      if (!cardElement) throw new Error('Card element not found')

      const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      })

      if (stripeError) {
        setError(stripeError.message || 'Payment failed')
        return
      }

      const token = getToken()
      const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/billing/create-stripe-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ planId, billingCycle, paymentMethodId: paymentMethod.id })
      })

      if (response.ok) {
        onSuccess()
      } else {
        const data = await response.json()
        setError(data.message || 'Payment failed')
      }
    } catch (err: any) {
      setError(err.message || 'Payment failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <div className='p-4 border rounded-lg' style={{ borderColor: 'var(--border)' }}>
        <CardElement options={{
          style: {
            base: {
              fontSize: '16px',
              color: 'var(--text-primary)',
              '::placeholder': { color: 'var(--text-secondary)' },
            },
          },
        }} />
      </div>
      {error && <p className='text-sm text-red-500'>{error}</p>}
      <button
        type='submit'
        disabled={!stripe || loading}
        className='w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold disabled:opacity-50'
        style={{
          background: 'linear-gradient(135deg, #635BFF 0%, #4F46E5 100%)',
          color: '#ffffff',
        }}
      >
        <CreditCard size={20} />
        <span>{loading ? 'Processing...' : 'Pay with Card'}</span>
      </button>
    </form>
  )
}

const SubscribePage: FC = (): ReactElement => {
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<{ planId: string; billingCycle: 'MONTHLY' | 'YEARLY' } | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'paypal' | 'card'>('paypal')

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/billing/plans`)
        if (!response.ok) {
          throw new Error('Failed to fetch plans')
        }
        const data = await response.json()
        console.log('Plans response:', data)
        setPlans(data.data || [])
      } catch (error) {
        console.error('Error fetching plans:', error)
      }
    }
    fetchPlans()

    // Check subscription status
    const checkSubscription = async () => {
      const token = getToken()
      if (!token) {
        console.log('No token found, skipping subscription check')
        return
      }
      
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/billing/me/subscription`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
        if (response.ok) {
          const data = await response.json()
          if (data.hasActiveSubscription) {
            window.location.href = '/ds'
          }
        } else if (response.status === 401) {
          console.log('Unauthorized - token may be invalid or expired')
        }
      } catch (error) {
        console.error('Error checking subscription:', error)
      }
    }
    checkSubscription()
  }, [])

  const handleSubscribe = (planId: string, billingCycle: 'MONTHLY' | 'YEARLY') => {
    setSelectedPlan({ planId, billingCycle })
  }

  const getToken = () => {
    let tokenStr = localStorage.getItem('token')
    if (!tokenStr) return null
    try {
      const parsed = JSON.parse(tokenStr)
      return typeof parsed === 'string' ? parsed : tokenStr
    } catch {
      return tokenStr
    }
  }

  const createOrder = async () => {
    if (!selectedPlan) {
      throw new Error('No plan selected')
    }
    const token = getToken()
    if (!token) {
      throw new Error('Not authenticated')
    }
    const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/billing/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(selectedPlan)
    })
    if (!response.ok) {
      throw new Error('Failed to create order')
    }
    const data = await response.json()
    return data.orderId
  }

  const onApprove = async (data: any) => {
    try {
      setLoading(true)
      console.log('Payment approved:', data)
      // Verify payment on backend
      const token = getToken()
      const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/billing/verify-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ orderId: data.orderID })
      })
      if (response.ok) {
        window.location.href = '/ds'
      } else {
        alert('Payment verification failed')
      }
    } catch (error) {
      console.error('Payment error:', error)
      alert('Payment processing failed')
    } finally {
      setLoading(false)
    }
  }

  const onError = (err: any) => {
    console.error('PayPal error:', err)
    alert('Payment failed. Please try again.')
    setSelectedPlan(null)
  }

  return (
    <PayPalScriptProvider options={{ clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID, currency: 'USD' }}>
      <section className='w-[100%] max-w-6xl mx-auto py-12'>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className='text-center mb-12'
      >
        <h1 className='text-4xl font-bold mb-4' style={{ color: 'var(--text-primary)' }}>
          Choose Your Plan
        </h1>
        <p className='text-lg' style={{ color: 'var(--text-secondary)' }}>
          Get full access to all Carbonoz platform features
        </p>
      </motion.div>

      <div className='text-center mb-8'>
        <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
          Secure payment powered by PayPal & Stripe • Cancel anytime
        </p>
      </div>

      <div className='grid md:grid-cols-2 gap-8'>
        {plans.map((plan, index) => (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className='border rounded-2xl p-8 relative overflow-hidden'
            style={{ 
              background: 'var(--surface-raised)', 
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            {plan.priceYearly && (
              <div className='absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-semibold' style={{ background: '#22c55e', color: '#ffffff' }}>
                Save 17%
              </div>
            )}

            <h3 className='text-2xl font-bold mb-2' style={{ color: 'var(--text-primary)' }}>
              {plan.name}
            </h3>
            <p className='text-sm mb-6' style={{ color: 'var(--text-secondary)' }}>
              {plan.description}
            </p>

            <div className='mb-6'>
              <div className='flex items-baseline gap-2 mb-2'>
                <span className='text-4xl font-bold' style={{ color: '#DEAF0B' }}>
                  ${plan.priceYearly ? plan.priceYearly : plan.priceMonthly}
                </span>
                <span className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                  / {plan.priceYearly ? 'year' : 'month'}
                </span>
              </div>
              {plan.priceYearly && (
                <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>
                  ${plan.priceMonthly}/month when billed annually
                </p>
              )}
            </div>

            <ul className='space-y-3 mb-8'>
              {(plan.features && plan.features.length > 0 ? plan.features : [
                'Full platform access',
                'SolarAutopilot integration',
                'Real-time monitoring',
                'Carbon intensity tracking',
                'Analytics & reports',
                'Priority support'
              ]).map((feature, i) => (
                <li key={i} className='flex items-center gap-2'>
                  <Check size={16} style={{ color: '#22c55e' }} />
                  <span className='text-sm' style={{ color: 'var(--text-primary)' }}>
                    {feature}
                  </span>
                </li>
              ))}
            </ul>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleSubscribe(plan.id, plan.priceYearly ? 'YEARLY' : 'MONTHLY')}
              disabled={loading}
              className='w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all duration-200 disabled:opacity-50'
              style={{
                background: 'linear-gradient(135deg, #DEAF0B 0%, #c99d0a 100%)',
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(222,175,11,0.3)'
              }}
            >
              <CreditCard size={20} />
              <span>{loading ? 'Processing...' : 'Subscribe Now'}</span>
            </motion.button>

            {selectedPlan?.planId === plan.id && (
              <div className='mt-4 space-y-4'>
                <div className='flex gap-2 mb-4'>
                  <button
                    onClick={() => setPaymentMethod('paypal')}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                      paymentMethod === 'paypal' ? 'bg-[#0070BA] text-white' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    PayPal
                  </button>
                  <button
                    onClick={() => setPaymentMethod('card')}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                      paymentMethod === 'card' ? 'bg-[#635BFF] text-white' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    Card
                  </button>
                </div>

                {paymentMethod === 'paypal' ? (
                  <PayPalButtons
                    createOrder={createOrder}
                    onApprove={onApprove}
                    onError={onError}
                    style={{ layout: 'vertical' }}
                  />
                ) : (
                  <Elements stripe={stripePromise}>
                    <CardPaymentForm
                      planId={plan.id}
                      billingCycle={plan.priceYearly ? 'YEARLY' : 'MONTHLY'}
                      onSuccess={() => window.location.href = '/ds'}
                    />
                  </Elements>
                )}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <div className='mt-12 text-center'>
        <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
          💳 Pay with PayPal or Credit/Debit Card • Secure & Encrypted • Cancel anytime
        </p>
      </div>
    </section>
    </PayPalScriptProvider>
  )
}

export default SubscribePage
