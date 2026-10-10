import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveListing } from '../db.ts';
import { ListingForm } from '../components/ListingForm.tsx';
import { back } from '../router.ts';

export function EditPage({ id }: { id: string }) {
  const listing = useLiveQuery(() => db.listings.get(id), [id], null);
  if (listing === null) return null;
  if (!listing) return <p className="empty">This home was deleted. <a href="#/">Back to your homes</a></p>;
  return (
    <>
      <header className="page-head">
        <h1>Edit home</h1>
      </header>
      <ListingForm
        key={listing.id}
        initial={listing}
        submitLabel="Save changes"
        onCancel={() => back(`/l/${id}`)}
        onSubmit={async (l) => {
          await saveListing(l);
          back(`/l/${id}`);
        }}
      />
    </>
  );
}
