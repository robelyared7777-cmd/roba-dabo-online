import "./globals.css";
export const metadata={title:"Roba Dabo",description:"Roba Dabo online bread shop management"};
export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body>{children}</body></html>;
}
