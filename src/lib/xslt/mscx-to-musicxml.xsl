<?xml version="1.0" encoding="UTF-8"?>
<!--
  MSCX to MusicXML (score-partwise) XSLT 3.0 Stylesheet
  Converts MuseScore 4 .mscx XML to MusicXML 4.0 score-partwise format.

  Supported mappings:
    - Staff -> part
    - Part (instrument defs) -> part-list
    - Measure -> measure
    - KeySig -> key (fifths + mode)
    - TimeSig -> time (beats + beat-type)
    - Chord + Note -> note (pitch: step/alter/octave + duration)
    - Rest -> note with rest element + duration
    - Harmony -> harmony (root + kind)
-->
<xsl:stylesheet version="3.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:xs="http://www.w3.org/2001/XMLSchema"
  exclude-result-prefixes="xs">

  <xsl:output method="xml" indent="yes" encoding="UTF-8"
    doctype-public="-//Recordare//DTD MusicXML 4.0 Partwise//EN"
    doctype-system="http://www.musicxml.org/dtds/partwise.dtd"/>

  <!-- TPC (tonal pitch class) to step+alter mapping.
       TPC values: -1=Fbb, 0=Cbb, 1=Gbb, ... 13=F, 14=C, 15=G, ... 33=B##
       The circle of fifths offset from C(14): step order and alter -->

  <!-- Lookup arrays for TPC -> step name -->
  <xsl:variable name="tpc-steps" as="xs:string*"
    select="('F','C','G','D','A','E','B','F','C','G','D','A','E','B','F','C','G','D','A','E','B','F','C','G','D','A','E','B','F','C','G','D','A','E','B')"/>

  <!-- Lookup arrays for TPC -> alter (accidental offset) -->
  <xsl:variable name="tpc-alters" as="xs:integer*"
    select="(-2,-2,-2,-2,-2,-2,-2,-1,-1,-1,-1,-1,-1,-1,0,0,0,0,0,0,0,1,1,1,1,1,1,1,2,2,2,2,2,2,2)"/>

  <!-- Root template -->
  <xsl:template match="/">
    <xsl:apply-templates select="museScore/Score"/>
  </xsl:template>

  <!-- Score -> score-partwise -->
  <xsl:template match="Score">
    <score-partwise version="4.0">
      <!-- Work title -->
      <xsl:if test="metaTag[@name='workTitle'] and string-length(metaTag[@name='workTitle']) &gt; 0">
        <work>
          <work-title><xsl:value-of select="metaTag[@name='workTitle']"/></work-title>
        </work>
      </xsl:if>

      <!-- Identification -->
      <identification>
        <encoding>
          <software>sheet-music-app MSCX converter</software>
          <encoding-date><xsl:value-of select="format-date(current-date(), '[Y]-[M01]-[D01]')"/></encoding-date>
        </encoding>
      </identification>

      <!-- Part list from Part elements -->
      <part-list>
        <xsl:for-each select="Part">
          <xsl:variable name="partIndex" select="position()"/>
          <score-part>
            <xsl:attribute name="id">P<xsl:value-of select="$partIndex"/></xsl:attribute>
            <part-name>
              <xsl:choose>
                <xsl:when test="Instrument/longName and string-length(Instrument/longName) &gt; 0">
                  <xsl:value-of select="Instrument/longName"/>
                </xsl:when>
                <xsl:when test="trackName and string-length(trackName) &gt; 0">
                  <xsl:value-of select="trackName"/>
                </xsl:when>
                <xsl:otherwise>Part <xsl:value-of select="$partIndex"/></xsl:otherwise>
              </xsl:choose>
            </part-name>
          </score-part>
        </xsl:for-each>
      </part-list>

      <!-- Parts from Staff elements -->
      <xsl:for-each select="Staff">
        <xsl:variable name="staffId" select="@id"/>
        <part>
          <xsl:attribute name="id">P<xsl:value-of select="$staffId"/></xsl:attribute>
          <xsl:apply-templates select="Measure">
            <xsl:with-param name="staffId" select="$staffId"/>
          </xsl:apply-templates>
        </part>
      </xsl:for-each>
    </score-partwise>
  </xsl:template>

  <!-- Measure -->
  <xsl:template match="Measure">
    <xsl:param name="staffId"/>
    <measure>
      <xsl:attribute name="number">
        <xsl:value-of select="position()"/>
      </xsl:attribute>

      <!-- Attributes (key sig, time sig, divisions) at start of measure -->
      <xsl:if test="voice/KeySig or voice/TimeSig or (position() = 1)">
        <attributes>
          <!-- Divisions: use 1 as base (quarter note = 1 division) -->
          <xsl:if test="position() = 1">
            <divisions>1</divisions>
          </xsl:if>

          <!-- Key signature -->
          <xsl:apply-templates select="voice/KeySig[1]"/>

          <!-- Time signature -->
          <xsl:apply-templates select="voice/TimeSig[1]"/>

          <!-- Clef on first measure -->
          <xsl:if test="position() = 1">
            <clef>
              <sign>G</sign>
              <line>2</line>
            </clef>
          </xsl:if>
        </attributes>
      </xsl:if>

      <!-- Process voice contents: harmonies, chords, rests -->
      <xsl:apply-templates select="voice/*[self::Harmony or self::Chord or self::Rest]"/>
    </measure>
  </xsl:template>

  <!-- Key Signature -->
  <xsl:template match="KeySig">
    <key>
      <fifths><xsl:value-of select="if (accidental) then accidental else 0"/></fifths>
      <mode>major</mode>
    </key>
  </xsl:template>

  <!-- Time Signature -->
  <xsl:template match="TimeSig">
    <time>
      <beats><xsl:value-of select="if (sigN) then sigN else 4"/></beats>
      <beat-type><xsl:value-of select="if (sigD) then sigD else 4"/></beat-type>
    </time>
  </xsl:template>

  <!-- Harmony (chord symbols) -->
  <xsl:template match="Harmony">
    <harmony>
      <root>
        <root-step>
          <xsl:variable name="rootTpc" select="if (root) then xs:integer(root) else 14"/>
          <xsl:value-of select="$tpc-steps[$rootTpc + 2]"/>
        </root-step>
        <xsl:variable name="rootTpc" select="if (root) then xs:integer(root) else 14"/>
        <xsl:variable name="rootAlter" select="$tpc-alters[$rootTpc + 2]"/>
        <xsl:if test="$rootAlter != 0">
          <root-alter><xsl:value-of select="$rootAlter"/></root-alter>
        </xsl:if>
      </root>
      <kind>
        <xsl:choose>
          <xsl:when test="name = 'm' or name = 'min'">minor</xsl:when>
          <xsl:when test="name = '7'">dominant</xsl:when>
          <xsl:when test="name = 'maj7'">major-seventh</xsl:when>
          <xsl:when test="name = 'm7' or name = 'min7'">minor-seventh</xsl:when>
          <xsl:when test="name = 'dim'">diminished</xsl:when>
          <xsl:when test="name = 'aug'">augmented</xsl:when>
          <xsl:when test="name = 'sus4'">suspended-fourth</xsl:when>
          <xsl:when test="name = 'sus2'">suspended-second</xsl:when>
          <xsl:otherwise>major</xsl:otherwise>
        </xsl:choose>
      </kind>
    </harmony>
  </xsl:template>

  <!-- Chord -> note(s) -->
  <xsl:template match="Chord">
    <xsl:variable name="durationType" select="durationType"/>
    <xsl:variable name="duration" select="
      if ($durationType = 'whole') then 4
      else if ($durationType = 'half') then 2
      else if ($durationType = 'quarter') then 1
      else if ($durationType = 'eighth') then 0
      else if ($durationType = '16th') then 0
      else 1
    "/>
    <xsl:variable name="mxmlType" select="
      if ($durationType = 'whole') then 'whole'
      else if ($durationType = 'half') then 'half'
      else if ($durationType = 'quarter') then 'quarter'
      else if ($durationType = 'eighth') then 'eighth'
      else if ($durationType = '16th') then '16th'
      else 'quarter'
    "/>

    <xsl:for-each select="Note">
      <xsl:variable name="isChordNote" select="position() &gt; 1"/>
      <note>
        <xsl:if test="$isChordNote">
          <chord/>
        </xsl:if>

        <!-- Pitch from MIDI pitch value and TPC -->
        <pitch>
          <xsl:choose>
            <!-- Use TPC if available for accurate step/alter -->
            <xsl:when test="tpc">
              <xsl:variable name="tpcVal" select="xs:integer(tpc)"/>
              <xsl:variable name="tpcIndex" select="$tpcVal + 2"/>
              <step><xsl:value-of select="$tpc-steps[$tpcIndex]"/></step>
              <xsl:variable name="alter" select="$tpc-alters[$tpcIndex]"/>
              <xsl:if test="$alter != 0">
                <alter><xsl:value-of select="$alter"/></alter>
              </xsl:if>
              <!-- Octave from MIDI pitch -->
              <octave>
                <xsl:choose>
                  <xsl:when test="pitch">
                    <xsl:value-of select="xs:integer(pitch) idiv 12 - 1"/>
                  </xsl:when>
                  <xsl:otherwise>4</xsl:otherwise>
                </xsl:choose>
              </octave>
            </xsl:when>
            <!-- Fallback: derive from MIDI pitch number -->
            <xsl:when test="pitch">
              <xsl:variable name="midiPitch" select="xs:integer(pitch)"/>
              <xsl:variable name="noteClass" select="$midiPitch mod 12"/>
              <step>
                <xsl:choose>
                  <xsl:when test="$noteClass = 0">C</xsl:when>
                  <xsl:when test="$noteClass = 1">C</xsl:when>
                  <xsl:when test="$noteClass = 2">D</xsl:when>
                  <xsl:when test="$noteClass = 3">D</xsl:when>
                  <xsl:when test="$noteClass = 4">E</xsl:when>
                  <xsl:when test="$noteClass = 5">F</xsl:when>
                  <xsl:when test="$noteClass = 6">F</xsl:when>
                  <xsl:when test="$noteClass = 7">G</xsl:when>
                  <xsl:when test="$noteClass = 8">G</xsl:when>
                  <xsl:when test="$noteClass = 9">A</xsl:when>
                  <xsl:when test="$noteClass = 10">A</xsl:when>
                  <xsl:when test="$noteClass = 11">B</xsl:when>
                </xsl:choose>
              </step>
              <xsl:if test="$noteClass = 1 or $noteClass = 3 or $noteClass = 6 or $noteClass = 8 or $noteClass = 10">
                <alter>1</alter>
              </xsl:if>
              <octave><xsl:value-of select="$midiPitch idiv 12 - 1"/></octave>
            </xsl:when>
            <xsl:otherwise>
              <step>C</step>
              <octave>4</octave>
            </xsl:otherwise>
          </xsl:choose>
        </pitch>

        <duration>
          <xsl:choose>
            <xsl:when test="$duration &gt; 0"><xsl:value-of select="$duration"/></xsl:when>
            <xsl:otherwise>1</xsl:otherwise>
          </xsl:choose>
        </duration>
        <type><xsl:value-of select="$mxmlType"/></type>
      </note>
    </xsl:for-each>
  </xsl:template>

  <!-- Rest -->
  <xsl:template match="Rest">
    <xsl:variable name="durationType" select="durationType"/>
    <xsl:variable name="duration" select="
      if ($durationType = 'whole') then 4
      else if ($durationType = 'half') then 2
      else if ($durationType = 'quarter') then 1
      else if ($durationType = 'eighth') then 0
      else if ($durationType = '16th') then 0
      else 1
    "/>
    <xsl:variable name="mxmlType" select="
      if ($durationType = 'whole') then 'whole'
      else if ($durationType = 'half') then 'half'
      else if ($durationType = 'quarter') then 'quarter'
      else if ($durationType = 'eighth') then 'eighth'
      else if ($durationType = '16th') then '16th'
      else 'quarter'
    "/>

    <note>
      <rest/>
      <duration>
        <xsl:choose>
          <xsl:when test="$duration &gt; 0"><xsl:value-of select="$duration"/></xsl:when>
          <xsl:otherwise>1</xsl:otherwise>
        </xsl:choose>
      </duration>
      <type><xsl:value-of select="$mxmlType"/></type>
    </note>
  </xsl:template>

</xsl:stylesheet>
