import React from 'react'
import { createRoot } from 'react-dom/client';
import Home from './components/Home.js'

// process.env.OPENAI_API_KEY = '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';
console.log(process.env)
let r = document.createElement('div')

r.id = 'root'
document.body.appendChild(r)

const container = document.getElementById('root');
const root = createRoot(container); // createRoot(container!) if you use TypeScript
root.render(<Home />);
