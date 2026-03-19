import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App'
import { AuthProvider } from './context/AuthContext'
import { BranchProvider } from './context/BranchContext'
import { PeriodProvider } from './context/PeriodContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PeriodProvider>
          <BranchProvider>
            <App />
          </BranchProvider>
        </PeriodProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
