export const metadata = {
  title: "Optical Inventory",
  description: "Lab assets manager",
};

export default function Head() {
  return (
    <>
      <title>{metadata.title}</title>
      <meta name="description" content={metadata.description} />
    </>
  );
}
