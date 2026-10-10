import { useRoute } from './router.ts';
import { ListPage } from './pages/ListPage.tsx';
import { AddPage } from './pages/AddPage.tsx';
import { DetailPage } from './pages/DetailPage.tsx';
import { EditPage } from './pages/EditPage.tsx';
import { ViewingsPage } from './pages/ViewingsPage.tsx';
import { MorePage } from './pages/MorePage.tsx';

export function App() {
  const { path, params } = useRoute();
  const listing = path.match(/^\/l\/([^/]+)(\/edit)?$/);

  let page;
  let tab = '';
  if (path === '/' || path === '') {
    page = <ListPage />;
    tab = 'homes';
  } else if (path === '/add') {
    page = <AddPage params={params} />;
    tab = 'add';
  } else if (path === '/viewings') {
    page = <ViewingsPage />;
    tab = 'viewings';
  } else if (path === '/more') {
    page = <MorePage />;
    tab = 'more';
  } else if (listing?.[2]) {
    page = <EditPage id={listing[1]} />;
  } else if (listing) {
    page = <DetailPage key={listing[1]} id={listing[1]} />;
  } else {
    page = <p className="empty">Page not found. <a href="#/">Back to your homes</a></p>;
  }

  return (
    <div className="app">
      <main className="page">{page}</main>
      <nav className="tabbar" aria-label="Main">
        <a href="#/" className={tab === 'homes' ? 'active' : ''}>
          <span aria-hidden>🏠</span>Homes
        </a>
        <a href="#/viewings" className={tab === 'viewings' ? 'active' : ''}>
          <span aria-hidden>📅</span>Viewings
        </a>
        <a href="#/add" className={`add ${tab === 'add' ? 'active' : ''}`}>
          <span aria-hidden>＋</span>Add
        </a>
        <a href="#/more" className={tab === 'more' ? 'active' : ''}>
          <span aria-hidden>⋯</span>More
        </a>
      </nav>
    </div>
  );
}
