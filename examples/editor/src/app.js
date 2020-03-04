import "regenerator-runtime/runtime";

import CodeFlask from 'codeflask';

import MQTT from "paho-mqtt";
import dicomParser from "dicom-parser";
import * as dcmjs from 'dcmjs';
const {  DicomDict, DicomMessage, DicomMetaDictionary } = dcmjs.data;
import './editor.css';
import './prism-radlex';

const url_string = window.location.href
const localurl = new URL(url_string)
const study_id = localurl.searchParams.get("studyUID");

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
    client.subscribe('got/report', {qos: 1});
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

var newtext = ''
var oldtext = {}
var oldsrs = {}

window.patient_name = null
window.patientID = null

var radlex_header_dict = {};
radlex_header_dict['RID13166'] = 'Klinik'
radlex_header_dict['RID28482'] = 'Untersuchungsprotokoll'
radlex_header_dict['RID28483'] = 'Vergleich'
radlex_header_dict['RID28486'] = 'Befund'
radlex_header_dict['RID13170'] = 'Beurteilung'


function textFromSR(sr){
    let text = ''
    try{
        var content_elements = sr['0040A730'].Value
    }catch(e){
        return ''
    }
    for(let j in content_elements){
        try{
            let type = content_elements[j]['0040A040'].Value[0]
            if( type != 'TEXT'){
                continue
            }
            let codevalue = content_elements[j]['0040A043'].Value[0]['00080100'].Value[0]
            text += radlex_header_dict[codevalue] + ':\n'
            text += content_elements[j]["0040A160"].Value[0].trim() + '\n\n'
        }catch(e){
            console.log(e)
        }
    }
    return text
}

function srFromText(text, oldsr){
    if(Object.entries(oldsr.dict).length === 0){
        return oldsr
    }
    let headers = Object.values(radlex_header_dict)
    let regexpstr = headers.join(':|')+':'
    let regexp = new RegExp(regexpstr, 'g')
    let matched = text.match(regexp)
    if(matched === null){
        return oldsr
    }
    let parts = text.split(regexp)
    for(let i in matched ){
        matched[+i] = matched[+i].slice(0,-1)
    }
    let content_elements = oldsr.dict['0040A730'].Value
    let newsr = new DicomDict(oldsr.meta)
    Object.assign(newsr.dict, oldsr.dict);
    newsr.upsertTag("00080005", "CS", "ISO_IR 192");
    newsr.upsertTag("00081030", "LO", "Entwurf");
    for(let j in content_elements){
        try{
            let type = content_elements[j]['0040A040'].Value[0]
            if( type != 'TEXT'){
                continue
            }
            let codevalue = content_elements[j]['0040A043'].Value[0]['00080100'].Value[0]
            let header = radlex_header_dict[codevalue]
            let index = matched.indexOf(header)
            if(index > -1){
                newsr.dict['0040A730'].Value[j]["0040A160"].Value[0] = parts[index+1].trim()
            }
        } catch(e){
            console.log(e)
        }
    }
    return newsr
}


const dropdown_sr = document.getElementById("dropdown_sr");
var sr_template = new DicomDict({});

function arrayToBuffer(array) {
    return array.buffer.slice(array.byteOffset, array.byteLength + array.byteOffset)
}

client.onMessageArrived = function (message) {
    console.log("RECEIVE ON " + message.destinationName);
    window.bytesin = message.payloadBytes;
    var ds0 = DicomMessage.readFile(arrayToBuffer(message.payloadBytes));
    var ds = ds0.dict;
    if(study_id == ds['0020000D'].Value[0]){
        window.patientID = ds['00100020'].Value[0];
        try{
            window.patient_name = ds['00100010'].Value[0]['Alphabetic']
        }catch(e){
            window.patient_name = ds['00100010'].Value[0]
        }
    }
    if(flask2.getCode() == "" && study_id == ds['0020000D'].Value[0] && 
        ds['00080016'].Value[0] == DicomMetaDictionary.sopClassUIDsByName['BasicTextSR'] &&
        ds['0040A730']){
        sr_template = ds0;
        flask2.updateCode(textFromSR(ds));
        download_reports();
    }
    if(ds['00080016'].Value[0] == DicomMetaDictionary.sopClassUIDsByName['BasicTextSR'] &&
        ds['0040A730']){
        try{
            var series_description  = ds['0008103E'].Value[0]
            if(series_description == 'PhoenixZIPReport'){
                return
            }
        }catch(e){}
        console.log(ds)
        let title = ds["00080020"].Value[0] + " " + ds["00081030"].Value[0];
        let physician = '';
        try{
            physician = ds["0040A078"].Value[0]["0040A123"].Value[0];
        }catch(e){
        }
        if(typeof physician != "string"){
            try{
                physician = ds["0040A078"].Value[0]["0040A123"].Value[0].Alphabetic;
            }catch(e){
            }
        }
        
        let content = textFromSR(ds)
        if(content.length>0){
            if(!(title in oldtext)){
                let option = document.createElement("option");
                option.text = title;
                dropdown_sr.add(option);  
            }
            oldtext[title] = physician + (physician == '' ? '' : '\n');
            oldtext[title] += content
            oldsrs[title] = ds0    
            change_oldtext();          
        }
    }
};

function download_reports(){
    var ds = new DicomDict({});
    let patient_name = window.patient_name;
    let patientID = window.patientID;
    if(patientID != null){
        ds.upsertTag("00100020", "LO", patientID);
    }else{
        ds.upsertTag("0020000D", "UI", study_id);
    }
    ds.upsertTag("00080060", "CS", "SR")
    var fileBuffer = ds.write();
    var message = new MQTT.Message(fileBuffer);
    message.destinationName = "get/reports";
    console.log("SEND ON " + message.destinationName);
    client.send(message);
};

document.getElementById("reload").addEventListener("click", download_reports);


const flask1 = new CodeFlask('#editor1', { 
    language: 'radlex',
    handleNewLineIndentation: false,
    handleTabs: false,
});
flask1.updateCode("");
if(dropdown_sr.value) flask1.updateCode(oldtext[dropdown_sr.value]);

const flask2 = new CodeFlask('#editor2', { 
    language: 'radlex',
    handleNewLineIndentation: false,
    handleTabs: false,
});
flask2.updateCode("");
if(newtext.trim()) flask2.updateCode(newtext.trim());

export const innerDimensions = (node) => {
    var computedStyle = getComputedStyle(node)
  
    let width = node.clientWidth // width with padding
    let height = node.clientHeight // height with padding
  
    height -= parseFloat(computedStyle.paddingTop) + parseFloat(computedStyle.paddingBottom)
    width -= parseFloat(computedStyle.paddingLeft) + parseFloat(computedStyle.paddingRight)
    return { height, width }
}

flask2.updateCode("Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet. Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.");

flask2.onUpdate((code) => {
    let cwidth = document.getElementById("width_measure100").offsetWidth/100;
    let textareadcwidth = Math.floor(innerDimensions(flask2.elTextarea).width / cwidth);
    let blocks = code.split("\n\n");
    let out = "";
    for(let i in blocks){
        let blocktext = blocks[i].replace("\n"," ");
        let words = blocktext.split(" ");
        let spaceLeft = textareadcwidth;
        for(let j in words){
            if(words[j].length > spaceLeft){
                out.substring(0,out.length-1);
                out += "\n" + words[j];
                spaceLeft = textareadcwidth - words[j].length;
            }else{
                out += words[j] + " ";
                spaceLeft -= words[j].length;
            }
        }
        out += "\n\n";
    }
    out = out.substring(0,out.length-2)
    console.log(out);
    //flask2.updateCode(out);
});

function change_oldtext(){
    var selectElement = dropdown_sr;
    var value = selectElement.value;
    flask1.updateCode(oldtext[value])
}

dropdown_sr.onchange = function(event){
    change_oldtext()
}

// Save periodically
var last_saved = '';
setInterval(function() {
    var newtext = flask2.getCode();
    if(newtext == last_saved){
        return
    }else{
        last_saved = newtext;
    }
    let newsr = srFromText(newtext, sr_template);
    if(Object.entries(newsr.dict).length === 0){
        return
    }
    var fileBuffer = newsr.write();
    var message = new MQTT.Message(fileBuffer);
    message.destinationName = "stored/instance";
    console.log("SEND ON " + message.destinationName);
    client.send(message);
}, 5*1000);


// Check for unsaved data
window.onbeforeunload = function() {
}

