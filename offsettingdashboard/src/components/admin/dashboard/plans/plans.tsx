import { FC, useState, useEffect } from 'react'
import { DollarSign, Edit, Save, X, Plus, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'

interface Plan {
  id: string
  name: string
  description: string
  features: string[]
  priceMonthly: number
  priceYearly: number | null
  currency: string
  active: boolean
}

const PlansManagement: FC = () => {
  const [plans, setPlans] = useState<Plan[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Plan>>({})

  useEffect(() => {
    fetchPlans()
  }, [])

  const fetchPlans = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/billing/plans`)
      if (response.ok) {
        const data = await response.json()
        setPlans(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching plans:', error)
    }
  }

  const handleEdit = (plan: Plan) => {
    setEditing(plan.id)
    setEditData({ ...plan, features: plan.features || [] })
  }

  const handleSave = async () => {
    try {
      // Only send updatable fields
      const updateData = {
        name: editData.name,
        description: editData.description,
        features: editData.features,
        priceMonthly: editData.priceMonthly,
        priceYearly: editData.priceYearly,
        active: editData.active,
      };
      
      console.log('Saving plan:', updateData)
      const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/billing/admin/plans/${editing}/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })
      
      console.log('Response status:', response.status)
      
      if (response.ok) {
        alert('Plan updated successfully!')
        setEditing(null)
        fetchPlans()
      } else {
        const error = await response.json().catch(() => ({}))
        console.error('Save error:', error)
        alert('Failed to save plan: ' + (error.message || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error saving plan:', error)
      alert('Error saving plan: ' + error.message)
    }
  }

  const handleCancel = () => {
    setEditing(null)
    setEditData({})
  }

  const addFeature = () => {
    setEditData({ ...editData, features: [...(editData.features || []), ''] })
  }

  const updateFeature = (index: number, value: string) => {
    const features = [...(editData.features || [])]
    features[index] = value
    setEditData({ ...editData, features })
  }

  const removeFeature = (index: number) => {
    const features = [...(editData.features || [])]
    features.splice(index, 1)
    setEditData({ ...editData, features })
  }

  return (
    <div className='w-full p-4'>
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className='text-xl sm:text-2xl mb-6 font-bold'
        style={{ color: 'var(--text-primary)' }}
      >
        Subscription Plans
      </motion.h1>

      <div className='grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2'>
        {plans.map((plan) => (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className='border rounded-xl p-4 sm:p-6'
            style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
          >
            {editing === plan.id ? (
              <div className='space-y-3'>
                <input
                  type='text'
                  value={editData.name || ''}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  className='w-full px-3 py-2 border rounded text-sm'
                  style={{ background: 'var(--surface-base)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                  placeholder='Plan Name'
                />
                <textarea
                  value={editData.description || ''}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  className='w-full px-3 py-2 border rounded text-sm'
                  style={{ background: 'var(--surface-base)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                  placeholder='Description'
                  rows={2}
                />
                
                <div>
                  <div className='flex justify-between items-center mb-2'>
                    <label className='text-xs font-medium' style={{ color: 'var(--text-primary)' }}>Features</label>
                    <button onClick={addFeature} className='text-xs flex items-center gap-1' style={{ color: '#DEAF0B' }}>
                      <Plus size={12} /> Add
                    </button>
                  </div>
                  <div className='space-y-2'>
                    {(editData.features || []).map((feature, i) => (
                      <div key={i} className='flex gap-2'>
                        <input
                          type='text'
                          value={feature}
                          onChange={(e) => updateFeature(i, e.target.value)}
                          className='flex-1 px-3 py-2 border rounded text-sm'
                          style={{ background: 'var(--surface-base)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                          placeholder='Feature name'
                        />
                        <button onClick={() => removeFeature(i)} className='p-2 text-red-500'>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className='grid grid-cols-2 gap-3'>
                  <div>
                    <label className='text-xs font-medium block mb-1' style={{ color: 'var(--text-primary)' }}>Monthly</label>
                    <input
                      type='number'
                      step='0.01'
                      value={editData.priceMonthly || ''}
                      onChange={(e) => setEditData({ ...editData, priceMonthly: parseFloat(e.target.value) })}
                      className='w-full px-3 py-2 border rounded text-sm'
                      style={{ background: 'var(--surface-base)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                    />
                  </div>
                  <div>
                    <label className='text-xs font-medium block mb-1' style={{ color: 'var(--text-primary)' }}>Yearly</label>
                    <input
                      type='number'
                      step='0.01'
                      value={editData.priceYearly || ''}
                      onChange={(e) => setEditData({ ...editData, priceYearly: parseFloat(e.target.value) || null })}
                      className='w-full px-3 py-2 border rounded text-sm'
                      style={{ background: 'var(--surface-base)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                    />
                  </div>
                </div>
                <div className='flex gap-2'>
                  <button
                    onClick={handleSave}
                    className='flex items-center gap-1 px-3 py-2 bg-green-500 text-white rounded text-sm'
                  >
                    <Save size={14} /> Save
                  </button>
                  <button
                    onClick={handleCancel}
                    className='flex items-center gap-1 px-3 py-2 bg-gray-500 text-white rounded text-sm'
                  >
                    <X size={14} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className='flex justify-between items-start mb-3'>
                  <div className='flex-1 min-w-0'>
                    <h3 className='text-lg font-bold truncate' style={{ color: 'var(--text-primary)' }}>{plan.name}</h3>
                    <p className='text-xs sm:text-sm' style={{ color: 'var(--text-secondary)' }}>{plan.description}</p>
                  </div>
                  <button
                    onClick={() => handleEdit(plan)}
                    className='p-2 rounded flex-shrink-0'
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Edit size={16} />
                  </button>
                </div>
                
                {plan.features && plan.features.length > 0 && (
                  <div className='mb-3 space-y-1'>
                    {plan.features.map((feature, i) => (
                      <div key={i} className='text-xs flex items-center gap-2' style={{ color: 'var(--text-secondary)' }}>
                        <span className='w-1 h-1 rounded-full' style={{ background: '#DEAF0B' }}></span>
                        {feature}
                      </div>
                    ))}
                  </div>
                )}

                <div className='space-y-1'>
                  <div className='flex items-center gap-2'>
                    <DollarSign size={14} style={{ color: '#DEAF0B' }} />
                    <span className='font-semibold text-sm' style={{ color: 'var(--text-primary)' }}>${plan.priceMonthly}/mo</span>
                  </div>
                  {plan.priceYearly && (
                    <div className='flex items-center gap-2'>
                      <DollarSign size={14} style={{ color: '#DEAF0B' }} />
                      <span className='font-semibold text-sm' style={{ color: 'var(--text-primary)' }}>${plan.priceYearly}/yr</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

export default PlansManagement
