# CARBONOZ Design System - Quick Reference

## 🎨 Colors

### Primary
```css
--color-primary: #DEAF0B
```

### Usage in Tailwind
```jsx
<div className="bg-primary text-white">
<div className="border-primary">
<div className="text-primary">
```

### Usage in CSS
```css
background: var(--color-primary);
color: var(--color-primary);
border-color: var(--color-primary);
```

## 🔤 Typography

```jsx
<h1 className="text-h1">Heading 1</h1>
<h2 className="text-h2">Heading 2</h2>
<h3 className="text-h3">Heading 3</h3>
<p className="text-body">Body text</p>
<span className="text-caption">Caption</span>
<label className="text-label">Label</label>
```

## 📦 Spacing

```jsx
<div className="p-4">  {/* 16px */}
<div className="m-8">  {/* 32px */}
<div className="gap-6"> {/* 24px */}
```

## 🎭 Buttons

```jsx
// Primary
<CustomButton variant="primary">Save</CustomButton>

// Secondary
<CustomButton variant="secondary">Cancel</CustomButton>

// Ghost
<CustomButton variant="ghost">View</CustomButton>

// Destructive
<CustomButton variant="destructive">Delete</CustomButton>
```

## 📝 Inputs

```jsx
// Text Input
<CustomInput
  label="Email"
  name="email"
  type="normal"
  inputType="email"
  placeholder="Enter email"
/>

// Select
<CustomInput
  label="Country"
  name="country"
  type="select"
  options={[
    { label: 'USA', value: 'us' },
    { label: 'UK', value: 'uk' }
  ]}
/>

// Textarea
<CustomInput
  label="Description"
  name="description"
  type="textarea"
/>
```

## 🪟 Modals

```jsx
<CustomModal
  isVisible={isOpen}
  setIsVisible={setIsOpen}
  title="Modal Title"
  subTitle="Optional subtitle"
  width={600}
  footerContent={
    <CustomButton variant="primary">Confirm</CustomButton>
  }
>
  <p>Modal content here</p>
</CustomModal>
```

## 💳 Cards

```jsx
<div className="card-modern">
  <h3>Card Title</h3>
  <p>Card content</p>
</div>
```

## 🌓 Dark Mode

### Check Current Theme
```jsx
const darkMode = useSelector((state: RootState) => state.theme.darkMode)
```

### Toggle Theme
```jsx
const dispatch = useDispatch()
dispatch(toggleDarkMode())
```

### Conditional Styling
```jsx
<div className={`bg-white dark:bg-dark-200`}>
```

## 🎬 Animations

### Hover Effect
```jsx
<motion.div
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
>
  Content
</motion.div>
```

### Fade In
```jsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.2 }}
>
  Content
</motion.div>
```

### Slide In
```jsx
<motion.div
  initial={{ x: -100 }}
  animate={{ x: 0 }}
  transition={{ type: 'spring', stiffness: 300 }}
>
  Content
</motion.div>
```

## 🎯 Icons

```jsx
import { Home, User, Settings, Menu, X } from 'lucide-react'

<Home size={20} />
<User size={24} className="text-primary" />
<Settings size={20} strokeWidth={2.5} />
```

## 📊 Charts

### Custom Tooltip
```jsx
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className='bg-white dark:bg-dark-200 border border-gray-200 dark:border-dark-100 rounded-xl p-4 shadow-xl backdrop-blur-xl'>
        <p className='text-sm font-semibold text-gray-900 dark:text-white mb-2'>{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className='text-xs text-gray-600 dark:text-gray-400'>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    )
  }
  return null
}
```

### Line Chart
```jsx
<LineChart data={data}>
  <CartesianGrid strokeDasharray='3 3' stroke='rgba(222, 175, 11, 0.08)' />
  <XAxis 
    dataKey='date' 
    stroke='#9CA3AF'
    style={{ fontSize: '12px', fontFamily: 'Inter' }}
  />
  <YAxis stroke='#9CA3AF' />
  <Tooltip content={<CustomTooltip />} />
  <Line 
    type='monotone' 
    dataKey='value' 
    stroke='#DEAF0B' 
    strokeWidth={3}
  />
</LineChart>
```

## 🎨 Utility Classes

### Glassmorphism
```jsx
<div className="glass">
  Content with glassmorphism effect
</div>
```

### Gradient Text
```jsx
<h1 className="text-gradient">
  Gradient Text
</h1>
```

### Glow Border
```jsx
<div className="glow-border">
  Content with glow effect
</div>
```

### Skeleton Loader
```jsx
<div className="skeleton h-20 w-full"></div>
```

## 📱 Responsive Design

```jsx
<div className="
  grid 
  grid-cols-1 
  sm:grid-cols-2 
  lg:grid-cols-3 
  xl:grid-cols-4 
  gap-4
">
  {/* Content */}
</div>
```

## 🔔 Notifications

```jsx
import Notify from './components/common/notification/notification'

<Notify
  type="success"
  message="Success!"
  description="Operation completed successfully"
  placement="topRight"
  duration={4.5}
/>
```

## 🎯 Common Patterns

### Page Header
```jsx
<div className='w-full mb-8'>
  <div className='flex items-center gap-3 mb-2'>
    <div className='w-1 h-8 bg-primary rounded-full' />
    <h1 className='text-3xl font-bold text-gray-900 dark:text-white'>
      Page Title
    </h1>
  </div>
  <p className='text-gray-600 dark:text-gray-400 ml-7'>
    Page description
  </p>
</div>
```

### Section Card
```jsx
<div className='border border-gray-200 dark:border-dark-100 rounded-2xl overflow-hidden bg-white dark:bg-dark-200 shadow-sm hover:shadow-md transition-shadow duration-200'>
  <div className='flex justify-between items-center p-6 bg-gradient-to-r from-dark-400 to-dark-300 border-b border-dark-100'>
    <h2 className='text-lg font-bold text-white'>Section Title</h2>
  </div>
  <div className='p-6'>
    {/* Content */}
  </div>
</div>
```

### Stat Card
```jsx
<div className='relative h-40 w-full bg-white dark:bg-dark-200 rounded-2xl p-6 border border-gray-200 dark:border-dark-100 hover:border-primary/50 transition-all duration-200'>
  <div className='flex items-start justify-between'>
    <div className='w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center'>
      <Zap size={24} className='text-primary' />
    </div>
  </div>
  <div className='mt-4'>
    <p className='text-3xl font-bold text-gray-900 dark:text-white'>
      1,234
    </p>
    <p className='text-sm text-gray-600 dark:text-gray-400'>
      Total Items
    </p>
  </div>
</div>
```

## 🚀 Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run development server**:
   ```bash
   npm run dev
   ```

3. **Build for production**:
   ```bash
   npm run build
   ```

## 📚 Resources

- **Full Documentation**: See `DESIGN_SYSTEM.md`
- **Implementation Summary**: See `IMPLEMENTATION_SUMMARY.md`
- **Lucide Icons**: https://lucide.dev/icons/
- **Framer Motion**: https://www.framer.com/motion/
- **Tailwind CSS**: https://tailwindcss.com/docs

## 💡 Tips

1. Always use design tokens (CSS variables) instead of hardcoded colors
2. Use Lucide icons for consistency
3. Add framer-motion animations for better UX
4. Test in both light and dark modes
5. Ensure proper contrast ratios for accessibility
6. Use the 8pt grid system for spacing
7. Keep animations under 300ms for snappiness
8. Use glassmorphism sparingly for emphasis
