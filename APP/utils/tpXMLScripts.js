'use strict';

function getCancelSingleServiceBookingXML(parameterObj) {
	return `<?xml version="1.0"?>
	<!DOCTYPE Request SYSTEM "hostConnect_3_10_000.dtd">
	<Request>
  	<DeleteServiceRequest>
    	<AgentID>${parameterObj.AgentID}</AgentID>
        <Password>${parameterObj.Password}</Password>
    	<Ref>${parameterObj.Ref}</Ref>
    	<ServiceLineId>${parameterObj.ServiceLineId}</ServiceLineId>
    	<ForceDeleteAttempt>N</ForceDeleteAttempt>
  	</DeleteServiceRequest>
	</Request>`;
}

// function getCancelWholeBookingXML(parameterObj) {
// 	return `<?xml version="1.0"?>
// 	<!DOCTYPE Request SYSTEM "hostConnect_3_10_000.dtd">
// 	<Request>
// 		<CancelServicesRequest>
// 			<AgentID>uncircled</AgentID>
// 			<Password>kiril123</Password>
// 			<Ref>ECI2208619</Ref>
// 		</CancelServicesRequest>
// 	</Request>`
// }

function getTourplanUpdateBookingXML(parameterObj, paxList) {
	const xmlPaxList = paxList.map(function (pax) {
		return `
			<PaxDetails>
				<Title>${pax.title}</Title>
				<Forename>${pax.forename}</Forename>
				<Surname>${pax.surename}</Surname>
				<PaxType>${pax.paxtype}</PaxType>
			</PaxDetails>
		`;
	});

	return `<?xml version="1.0"?>
  <!DOCTYPE Request SYSTEM "hostConnect_3_10_000.dtd">
  <Request>
   <AddServiceRequest>
       <AgentID>${parameterObj.AgentID}</AgentID>
       <Password>${parameterObj.Password}</Password>
       <ExistingBookingInfo>
           <Ref>${parameterObj.Ref}</Ref>
       </ExistingBookingInfo>
       <OptionNumber>${parameterObj.OptionNumber}</OptionNumber>
       <RateId>Default</RateId>
       <DateFrom>${parameterObj.DateFrom}</DateFrom>
       <RoomConfigs>
           <RoomConfig>
               <Adults>${parameterObj.Adults}</Adults>
               <Children>${parameterObj.Children}</Children>
               <Infants>${parameterObj.Infants}</Infants>
               <RoomType>${parameterObj.RoomType}</RoomType>
               <PaxList>
                   ${xmlPaxList.join('')}
               </PaxList>
           </RoomConfig>
       </RoomConfigs>
       <SCUqty>${parameterObj.SCUqty}</SCUqty>
       <Consult>TAU UID</Consult>
       <AgentRef>TAU Reference</AgentRef>
       <Remarks>notes go here</Remarks>
       <Email>${parameterObj.agentTPUID}</Email>
   </AddServiceRequest>
</Request>`;
}

function getTourPlanNewBookingXML(parameterObj, paxList) {
	const xmlPaxList = paxList.map(function (pax) {
		return `
		<PaxDetails>
				<Title>${pax.title}</Title>
				<Forename>${pax.forename}</Forename>
				<Surname>${pax.surename}</Surname>
				<PaxType>${pax.paxtype}</PaxType>
		</PaxDetails>`;
	});

	return `<?xml version="1.0"?>
  <!DOCTYPE Request SYSTEM "hostConnect_3_10_000.dtd">
  <Request>
   <AddServiceRequest>
       <AgentID>${parameterObj.AgentID}</AgentID>
       <Password>${parameterObj.Password}</Password>
       <NewBookingInfo>
           <Name>${parameterObj.LeadPaxName}</Name>
           <QB>B</QB>
       </NewBookingInfo>
       <OptionNumber>${parameterObj.OptionNumber}</OptionNumber>
       <RateId>Default</RateId>
       <DateFrom>${parameterObj.DateFrom}</DateFrom>
       <RoomConfigs>
           <RoomConfig>
               <Adults>${parameterObj.Adults}</Adults>
               <Children>${parameterObj.Children}</Children>
               <Infants>${parameterObj.Infants}</Infants>
               <RoomType>${parameterObj.RoomType}</RoomType>
               <PaxList>
               		${xmlPaxList.join('')}
               </PaxList>
           </RoomConfig>
       </RoomConfigs>
       <SCUqty>${parameterObj.SCUqty}</SCUqty>
       <Consult>TAU UID</Consult>
       <AgentRef>TAU Reference</AgentRef>
       <puTime>0800</puTime>
       <puRemark>Hotel lobby</puRemark>
       <doTime>1800</doTime>
       <doRemark>Hotel Lobby</doRemark>
       <Remarks>notes go here</Remarks>
       <Email>${parameterObj.agentTPUID}</Email>
   </AddServiceRequest>
</Request>`;
}

function getTourAvailabilityXML(parameterObj) {
	return `<?xml version='1.0'?>
    <!DOCTYPE Request SYSTEM 'hostConnect_3_10_000.dtd'>
    <Request>
      <OptionInfoRequest>
        <AgentID>${parameterObj.agentid}</AgentID>
        <Password>${parameterObj.password}</Password>
        <OptionNumber>${parameterObj.productId}</OptionNumber>
        <Info>S</Info>
        <DateFrom>${parameterObj.date}</DateFrom>
        <SCUqty>1</SCUqty>
        <RoomConfigs>
            <RoomConfig>
                <Adults>${parameterObj.nrOfAdults}</Adults>
                <Children>${parameterObj.nrOfChildren}</Children>
                <Infants>${parameterObj.nrOfInfants}</Infants>
                <RoomType>TW</RoomType>
            </RoomConfig>
        </RoomConfigs>
        <MinimumAvailability>OK</MinimumAvailability>
      </OptionInfoRequest>
    </Request>`;
}

function getTransferAvailabilityXML(parameterObj) {
	let options = "";

	parameterObj.productIds.forEach((p) => {
		options += "<OptionNumber>" + p + "</OptionNumber>";
	});

	return `<?xml version='1.0'?>
    <!DOCTYPE Request SYSTEM 'hostConnect_3_10_000.dtd'>
    <Request>
      <OptionInfoRequest>
        <AgentID>${parameterObj.agentid}</AgentID>
        <Password>${parameterObj.password}</Password>
        ${options}
        <Info>S</Info>
        <DateFrom>${parameterObj.date}</DateFrom>
        <SCUqty>1</SCUqty>
        <RoomConfigs>
            <RoomConfig>
                <Adults>${parameterObj.nrOfAdults}</Adults>
                <Children>${parameterObj.nrOfChildren}</Children>
                <Infants>${parameterObj.nrOfInfants}</Infants>
                <RoomType>TW</RoomType>
            </RoomConfig>
        </RoomConfigs>
      </OptionInfoRequest>
    </Request>`;
}

function getAccessibleSuppliersXML(paramaterObject) {
	return `<?xml version='1.0'?>
  	<!DOCTYPE Request SYSTEM 'hostConnect_3_10_000.dtd'>
  	<Request>
  		<OptionInfoRequest>
    		<AgentID>${paramaterObject.agentid}</AgentID>
    		<Password>${paramaterObject.password}</Password>
    		<Opt>${paramaterObject.city.toUpperCase()}AC????????????</Opt>
    		<Info>GR</Info>
    		<DateFrom>${paramaterObject.date}</DateFrom>
    		<SCUqty>${paramaterObject.duration}</SCUqty>
  		</OptionInfoRequest>
		</Request>`;
}

function getRatesXML(parameterObject) {
	return `<?xml version='1.0'?>
  <!DOCTYPE Request SYSTEM 'hostConnect_3_10_000.dtd'>
	<Request>
 <OptionInfoRequest>
 <AgentID>uncircled</AgentID>
 <Password>kiril123</Password>
 <Opt>${parameterObject.optCode}</Opt>
 <Info>GR</Info>
 <DateFrom>${parameterObject.dateFrom}</DateFrom>
 <SCUqty>1</SCUqty>
 </OptionInfoRequest>
 </Request>`;
}

function getPromotionsXML(parameterObject) {
	return `<?xml version='1.0'?>
  <!DOCTYPE Request SYSTEM 'hostConnect_3_10_000.dtd'>
	<Request>
 <OptionInfoRequest>
 <AgentID>uncircled</AgentID>
 <Password>kiril123</Password>
 <Opt>${parameterObject.optCode}</Opt>
 <Info>GR</Info>
 <DateFrom>${parameterObject.dateFrom}</DateFrom>
 <SCUqty>1</SCUqty>
 </OptionInfoRequest>
 </Request>`;
}

function getAccessibleToursXML(parameterObject) {
	return `<?xml version='1.0'?>
  	<!DOCTYPE Request SYSTEM 'hostConnect_3_10_000.dtd'>
  	<Request>
  		<OptionInfoRequest>
    		<AgentID>${parameterObject.agentid}</AgentID>
    		<Password>${parameterObject.password}</Password>
    		<Opt>${parameterObject.city.toUpperCase()}PK????????????</Opt>
    		<Info>R</Info>
    		<DateFrom>${parameterObject.date}</DateFrom>
    		<SCUqty>1</SCUqty>
  		</OptionInfoRequest>
		</Request>`;
}
module.exports = {
	getTourplanUpdateBookingXML,
	getTourPlanNewBookingXML,
	getCancelSingleServiceBookingXML,
	getTourAvailabilityXML,
	getTransferAvailabilityXML,
	getAccessibleSuppliersXML,
	getRatesXML,
	getPromotionsXML,
	getAccessibleToursXML
};
