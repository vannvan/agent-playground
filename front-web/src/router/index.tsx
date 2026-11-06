import { createBrowserRouter } from 'react-router-dom'
import App from '../App'
import ManuscriptReviewPage from '../features/ManuscriptReviewPage'
import RagPage from '../features/RagPage'

export const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/review', element: <ManuscriptReviewPage /> },
  { path: '/rag', element: <RagPage /> },
])
