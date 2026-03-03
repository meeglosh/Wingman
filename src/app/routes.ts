import { createBrowserRouter } from 'react-router';
import Home from './pages/Home';
import Library from './pages/Library';
import PresentationView from './pages/PresentationView';
import WorkspaceEditor from './pages/WorkspaceEditor';
import PlaybackView from './pages/PlaybackView';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Home,
  },
  {
    path: '/library',
    Component: Library,
  },
  {
    path: '/present/:id',
    Component: PresentationView,
  },
  {
    path: '/playback/:id',
    Component: PlaybackView,
  },
  {
    path: '/edit/:id',
    Component: WorkspaceEditor,
  },
]);