/* @refresh reload */
import { render } from 'solid-js/web';
import App from './components/App.jsx';
import './index.css';

const root = document.getElementById('root');
if (root) {
  render(() => <App />, root);
}
