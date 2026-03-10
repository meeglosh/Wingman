import { createBrowserRouter } from 'react-router';
import RootLayout from './pages/RootLayout';
import Home from './pages/Home';
import Library from './pages/Library';
import WorkspaceEditor from './pages/WorkspaceEditor';
import PlaybackView from './pages/PlaybackView';

export const router = createBrowserRouter([
  {
    Component: RootLayout,
    children: [
      { path: '/', Component: Home },
      { path: '/library', Component: Library },
      { path: '/playback/:id', Component: PlaybackView },
      { path: '/edit/:id', Component: WorkspaceEditor },
    ],
  },
]);
