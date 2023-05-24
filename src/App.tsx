import React, { useState } from 'react';
import logo from './logo.svg';
import './App.css';
import { FileUploader } from "react-drag-drop-files";
import FitsCanvas from './fits_canvas';

// import "./styles.css";


const fileTypes = ["FITS"]

function App() {

  const [file, setFile] = useState(null as any);
  const [fileAB, setFileAB] = useState(undefined as unknown as ArrayBuffer);
  const handleChange = async (file: any) => {
    console.log(file[0])
    Object.assign(file[0], { preview: URL.createObjectURL(file[0]) })
    setFile(file[0]);
    let blob = await fetch(file[0].preview).then(r => r.blob());
    setFileAB(await blob.arrayBuffer())
  };

  return (
    <div className="App">
      <h1>Drag & Drop Fits Files</h1>
      <FileUploader
        multiple={true}
        handleChange={handleChange}
        name="file"
        types={fileTypes}
      />
      <p>{file ? `File name: ${file.name}` : "no files uploaded yet"}</p>
      {fileAB && (
        <React.Fragment>
          <FitsCanvas
            fitsAB={fileAB}
            stretch={'linear'}
            parentWidth={550}
            parentHeight={650}
            color={'#FFFFF'} />
        </React.Fragment>
      )
      }
    </div>
  );
}

export default App;
