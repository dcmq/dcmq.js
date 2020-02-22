import "regenerator-runtime/runtime";

import CodeFlask from 'codeflask';

import './editor.css';

const url_string = window.location.href
const localurl = new URL(url_string)
const study_id = localurl.searchParams.get("studyUID");


var newtext = ''
var oldtext = {}
var oldsrs = {}
var currentoldsr = null

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
    let content_elements = oldsr['0040A730'].Value
    let newsr = {}
    Object.assign(newsr, oldsr);
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
                newsr['0040A730'].Value[j]["0040A160"].Value[0] = parts[index+1].trim()
            }
        } catch(e){
        }
    }
    return newsr
}

var radlex_header_dict = {};
radlex_header_dict['RID13166'] = 'Klinik'
radlex_header_dict['RID28482'] = 'Untersuchungsprotokoll'
radlex_header_dict['RID28483'] = 'Vergleich'
radlex_header_dict['RID28486'] = 'Befund'
radlex_header_dict['RID13170'] = 'Beurteilung'

const dropdown_sr = document.getElementById("dropdown_sr");
var dropdown_options = [];
var sr_template = {};

async function update_oldsr(){
    let patient_name = window.patient_name;
    let patientID = window.patientID;
    let response = fetch('/api/downloadsr?patientID='+patientID)
    await (await response).json();
    let study_res = fetch('/rs/studies?00100010='+patient_name)
    let study_metadata = await (await study_res).json()
    console.log(study_metadata)
    let series_promises = []
    for(let i in study_metadata){
        let study_id2 = study_metadata[i]["0020000D"].Value[0]

        series_promises.push(fetch('/rs/studies/'+study_id2+'/series?00080060=SR'))
    }
    for(let i in series_promises){
        const sr_series_metadata = await (await series_promises[i]).json()
        console.log(sr_series_metadata)
        for(let k in sr_series_metadata){
            try{
                try{
                    var series_description  = sr_series_metadata[k]['0008103E'].Value[0]
                    if(series_description == 'PhoenixZIPReport'){
                        continue
                    }
                }catch(e){}
                
                let text = sr_series_metadata[k]["00080020"].Value[0];
                let physician = ''
                try{
                    physician = sr_series_metadata[k]["0040A078"].Value[0]["0040A123"].Value[0].Alphabetic + '\n'
                }catch(e){
                }
                let content = textFromSR(sr_series_metadata[k])
                if(content.length>0 && !(text in oldtext)){
                    oldtext[text] = physician 
                    oldtext[text] += content
                    oldsrs[text] = sr_series_metadata[k]
                    dropdown_options.push(text)                  
                }
            }catch(e){
                console.log(e)
            }
        }
    }
    dropdown_options.sort().reverse();
    for(let optiontext of dropdown_options){
        let option = document.createElement("option");
        option.text = optiontext;
        dropdown_sr.add(option);
    }
    dropdown_sr.sort
};

document.getElementById("reload").addEventListener("click", update_oldsr);

(async () => {
    if(study_id){
        
        let response = fetch('/api/getStudyQuestion?studyUID='+study_id)
        const rresponse = await response;

        const contentType = rresponse.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            sr_template = await rresponse.json()
            newtext = textFromSR(sr_template)
        } else {
            newtext = await rresponse.text()
        }

        let study_res = fetch('/rs/studies?0020000D='+study_id)
        let study_metadata = await (await study_res).json()
        if(study_metadata.length > 0){
            window.patient_name = ''
            window.patientID = ''
            try{
                window.patient_name = study_metadata[0]['00100010'].Value[0]['Alphabetic']
                window.patientID = study_metadata[0]['00100020'].Value[0]
            }catch(e){
                console.log(e)
            }
            await update_oldsr()
        }
    }

    currentoldsr = oldsrs[dropdown_sr.value]

    const flask1 = new CodeFlask('#editor1', { 
        language: 'js',
        handleNewLineIndentation: false,
        handleTabs: false,
    });
    flask1.updateCode("Vorbefund");
    if(dropdown_sr.value) flask1.updateCode(oldtext[dropdown_sr.value]);

    const flask2 = new CodeFlask('#editor2', { 
        language: 'radlex',
        handleNewLineIndentation: false,
        handleTabs: false,
    });
    flask2.updateCode("Aktueller Befund");
    if(newtext.trim()) flask2.updateCode(newtext.trim());

    dropdown_sr.onchange = function(event){
        var selectElement = event.target;
        var value = selectElement.value;
        flask1.updateCode(oldtext[value])
        currentoldsr = oldsrs[value]
    }

    // Save periodically
    setInterval(function() {
        let newsr = srFromText(flask1.getCode(), sr_template);
        fetch('/rs/studies', {
            method: 'POST',
            headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
            },
            body: JSON.stringify(newsr)
        }).then(response =>{
            return response.json()
        }).then(response => {
            console.log(response);
        })
    }, 5*1000);

    // Check for unsaved data
    window.onbeforeunload = function() {
    }

})()

