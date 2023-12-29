import React from 'react'
import { createRoot } from 'react-dom/client';
import App from './components/App.js'

let r = document.createElement('div')

r.id = 'root'
document.body.appendChild(r)

const container = document.getElementById('root');
const root = createRoot(container); // createRoot(container!) if you use TypeScript
root.render(<App />);
