# Frontend Integration Guide - Grafana Dashboards

## ✅ Setup Complete

**Dashboards Created:**
1. **Solar Power Dashboard** (UID: `solar_power_dashboard`) - Real-time gauges
2. **Solar Charts Dashboard** (UID: `solar_charts_dashboard`) - Historical charts

**Features:**
- ✅ Light/Dark theme support
- ✅ User-specific data filtering
- ✅ Auto-refresh (10s default)
- ✅ Responsive iframe embedding
- ✅ Kiosk mode (no Grafana UI)

## 🚀 Quick Integration

### 1. Add Environment Variable

```bash
# offsettingdashboard/.env
VITE_GRAFANA_URL=http://localhost:3001
```

### 2. Use the Component

```tsx
import GrafanaDashboard from '@/components/GrafanaDashboard'

// In your component
<GrafanaDashboard
  userId={user.id}
  dashboardUid="solar_power_dashboard"
  theme="light"
  height="600px"
  refresh="10s"
/>
```

### 3. Example with Theme Toggle

See `src/pages/DashboardPage.tsx` for complete example with:
- Light/Dark theme toggle
- Tab navigation between dashboards
- Responsive layout

## 📊 Dashboard UIDs

```typescript
const DASHBOARDS = {
  GAUGES: 'solar_power_dashboard',    // Real-time power gauges
  CHARTS: 'solar_charts_dashboard'    // Historical time-series
}
```

## 🎨 Theme Support

```tsx
// Light mode
<GrafanaDashboard theme="light" ... />

// Dark mode
<GrafanaDashboard theme="dark" ... />

// Dynamic theme
const [theme, setTheme] = useState<'light' | 'dark'>('light')
<GrafanaDashboard theme={theme} ... />
```

## ⏱️ Time Range Options

```tsx
// Last 24 hours (default)
<GrafanaDashboard timeRange={{ from: 'now-24h', to: 'now' }} />

// Last 7 days
<GrafanaDashboard timeRange={{ from: 'now-7d', to: 'now' }} />

// Custom range
<GrafanaDashboard timeRange={{ from: '2024-01-01', to: '2024-01-31' }} />
```

## 🔄 Refresh Intervals

```tsx
// 10 seconds (default)
<GrafanaDashboard refresh="10s" />

// 30 seconds
<GrafanaDashboard refresh="30s" />

// 1 minute
<GrafanaDashboard refresh="1m" />

// No auto-refresh
<GrafanaDashboard refresh="" />
```

## 📱 Responsive Heights

```tsx
// Fixed height
<GrafanaDashboard height="600px" />

// Viewport height
<GrafanaDashboard height="80vh" />

// Full screen
<GrafanaDashboard height="100vh" />
```

## 🔐 User Authentication

The component automatically filters data by userId:

```tsx
// Get userId from your auth context
const { user } = useAuth()

<GrafanaDashboard
  userId={user.id}  // Each user sees only their data
  dashboardUid="solar_power_dashboard"
/>
```

## 🎯 Complete Example

```tsx
import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import GrafanaDashboard from '@/components/GrafanaDashboard'

export const SolarDashboard = () => {
  const { user } = useAuth()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  return (
    <div>
      <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
        Toggle Theme
      </button>

      <GrafanaDashboard
        userId={user.id}
        dashboardUid="solar_power_dashboard"
        theme={theme}
        height="600px"
        refresh="10s"
      />
    </div>
  )
}
```

## 🔧 Troubleshooting

**Dashboard not loading?**
- Check VITE_GRAFANA_URL is set
- Verify Grafana is running: http://localhost:3001
- Check browser console for CORS errors

**No data showing?**
- Verify userId is correct
- Check data exists in InfluxDB for that user
- Verify time range includes data

**Theme not working?**
- Grafana must be restarted after theme changes
- Check theme parameter is 'light' or 'dark'

## 📚 Files Created

- `src/services/grafana.service.ts` - Grafana API service
- `src/components/GrafanaDashboard.tsx` - Reusable component
- `src/pages/DashboardPage.tsx` - Example implementation

## 🚀 Production Deployment

Update environment variables:

```bash
# Production
VITE_GRAFANA_URL=https://grafana.carbonoz.com
```

Ensure CORS is configured in Grafana for your domain.
