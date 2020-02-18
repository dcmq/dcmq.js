import "core-js/stable";
import "regenerator-runtime/runtime";
import React, { useState } from "react";
import ReactDOM from "react-dom";
import ReactDataGrid from 'react-data-grid';
import { Toolbar, Data } from "react-data-grid-addons";
import FakeToolbar from './FakeToolbar';
import "./styles.css";
import MQTT from "paho-mqtt";
import dicomParser from "dicom-parser";
import * as dcmjs from 'dcmjs';
const { DicomMetaDictionary, DicomDict } = dcmjs.data;

var wsbroker = location.hostname;  //mqtt websocket enabled broker
var wsport = 15675; // port for above

var client = new MQTT.Client(wsbroker, wsport, "/ws",
  "myclientid_" + parseInt(Math.random() * 100, 10));

client.onConnectionLost = function (responseObject) {
  console.log("CONNECTION LOST - " + responseObject.errorMessage);
  client.connect(options);
};

var options = {
  timeout: 3,
  onSuccess: function () {
    console.log("CONNECTION SUCCESS");
    client.subscribe('found/study', {qos: 1});
  },
  onFailure: function (message) {
    console.log("CONNECTION FAILURE - " + message.errorMessage);
  }
};

if (location.protocol == "https:") {
  options.useSSL = true;
}

console.log("CONNECT TO " + wsbroker + ":" + wsport);
client.connect(options);

function App(){

  const state = {
    studies: {
      columns: [
        { name: "PatientName", key: "patientName", filterable: true, resizable: true, sortable: true }, 
        { name: "Study date", key: "studydate", filterable: true, sortable: true, sortDescendingFirst: true }, 
        { name: "Study time", key: "studytime", }, 
        { name: "Modality", key: "modality", filterable: true, sortable: true }, 
        { name: "Instances", key: "instances", sortable: true }, 
        { name: "Birthdate", key: "birthdate", filterable: true, sortable: true }, 
        { name: "Server", key: "server", sortable: true }],
      rows: []
    }
  };

  const [filters, setFilters] = useState({});
  const [studiesState, setStudiesState] = useState(state.studies);
  
  var timeout = null; // timeout to prevent premature searching

  function sortRows(initialRows, sortColumn, sortDirection){
    const comparer = (a, b) => {
      if (sortDirection === "ASC") {
        return a[sortColumn] > b[sortColumn] ? 1 : -1;
      } else if (sortDirection === "DESC") {
        return a[sortColumn] < b[sortColumn] ? 1 : -1;
      }
    };
    return sortDirection === "NONE" ? initialRows : [...initialRows].sort(comparer);
  };

  client.onMessageArrived = function (message) {
    console.log("RECEIVE ON " + message.destinationName);
    var dataSet = dicomParser.parseDicom(message.payloadBytes);
    var rows = studiesState.rows;
    const row = {
      patientName: dataSet.string('x00100010'), 
      studydate: dataSet.string('x00080020'), 
      studytime: dataSet.string('x00080030'), 
      birthdate: dataSet.string('x00100030'), 
      modality: dataSet.string('x00080061'), 
      instances: dataSet.string('x00201208'), 
      server: dataSet.string('x00080054'), 
      studyInstanceUID: dataSet.string('x0020000D'),
    }
    rows.push(row);
    var newState = Object.assign({},studiesState);
    rows = sortRows(rows, "studydate", "DESC")
    newState.rows = rows;
    setStudiesState(newState);
  };

  function handleFilterChange(filter) { 
    return filters => {
      const newFilters = { ...filters };
      if (filter.filterTerm && filter.filterTerm.length > 2) {
        try{
          clearTimeout(timeout);
          timeout = setTimeout(function () {
            var ds = new DicomDict({});
            ds.upsertTag("00100010", "PN", filter.filterTerm);
            ds.upsertTag("00080020", "DA", "");
            ds.upsertTag("00080030", "TM", "");
            ds.upsertTag("00100030", "DA", "");
            ds.upsertTag("00080061", "CS", "");
            ds.upsertTag("00201208", "IS", "");
            ds.upsertTag("00080054", "CS", "");
            ds.upsertTag("0020000D", "UI", "");
            var fileBuffer = ds.write();
            var message = new MQTT.Message(fileBuffer);
            message.destinationName = "find/studies";
            console.log("SEND ON " + message.destinationName);
            client.send(message);
          }, 1000);
        }catch(err){
          console.log(err.message)
        }
        newFilters[filter.column.key] = filter;
      } else {
        delete newFilters[filter.column.key];
      }
      return newFilters;
    }
  };
  
  const activateStudy = async (study_id) => {
    window.open("/editor?studyUID=" + study_id);
  }

  const getStudy = async (study_id) => {
    var ds = new DicomDict({});
    ds.upsertTag("0020000D", "UI", study_id);
    var fileBuffer = ds.write();
    var message = new MQTT.Message(fileBuffer);
    message.destinationName = "get/study";
    console.log("SEND ON " + message.destinationName);
    client.send(message);
  }

  function handleRowDoubleClick(rowIndex){
    getStudy(studiesState.rows[rowIndex].studyInstanceUID)
  }

  return (
    <div className='App'>
    <ReactDataGrid
      columns={studiesState.columns}
      rowGetter={i => studiesState.rows[i]}
      rowsCount={studiesState.rows.length}
      minHeight={900} 
      toolbar={<FakeToolbar />}
      onAddFilter={filter => setFilters(handleFilterChange(filter))}
      onClearFilters={() => setFilters({})}
      onRowDoubleClick={handleRowDoubleClick}
      onGridSort={
        (sortColumn, sortDirection) => {
          var newState = Object.assign({},studiesState);
          newState.rows = sortRows(studiesState.rows, sortColumn, sortDirection);
          setStudiesState(newState);
        }
      }
    />
    </div>
  );
}

ReactDOM.render(<App />, document.querySelector('.content'))
